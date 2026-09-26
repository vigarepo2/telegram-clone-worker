import type {
  AuthSource,
  AuthStatusResponse,
  Result,
} from "../shared/rpcTypes";
import {
  generateSalt,
  hashPassword,
  randomToken,
  sha256,
  timingSafeStringCompare,
} from "./crypto";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME = "__Host-relay_session";
const LOCAL_COOKIE_NAME = "relay_session_local";
const RATE_WINDOW_MS = 15 * 60 * 1000;
const schemaReady = new WeakMap<D1Database, Promise<void>>();
const envVersions = new WeakMap<
  D1Database,
  { password: string; salt: string; version: string }
>();

type PasswordRecord = { hash: string; salt: string; version: string };
type AuthConfig = {
  source: AuthSource;
  password: PasswordRecord | null;
  version: string | null;
};

function json<T>(
  data: Result<T>,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function error(
  status: number,
  description: string,
  reason:
    "unauthorized" | "invalid_request" | "rate_limited" = "invalid_request",
): Response {
  return json({ ok: false, errorCode: status, description, reason }, status);
}

async function ensureAuthSchema(db: D1Database): Promise<void> {
  let ready = schemaReady.get(db);
  if (!ready) {
    ready = db
      .batch([
        db.prepare(
          "CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)",
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS auth_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL)",
        ),
      ])
      .then(() => undefined)
      .catch((cause: unknown) => {
        schemaReady.delete(db);
        throw cause;
      });
    schemaReady.set(db, ready);
  }
  await ready;
}

async function getAuthConfig(env: Env): Promise<AuthConfig> {
  await ensureAuthSchema(env.DB);
  if (env.ADMIN_PASSWORD?.trim()) {
    let saltRow = await env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'auth_env_salt'",
    ).first<{ value: string }>();
    if (!saltRow) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auth_env_salt', ?)",
      )
        .bind(generateSalt())
        .run();
      saltRow = await env.DB.prepare(
        "SELECT value FROM app_settings WHERE key = 'auth_env_salt'",
      ).first<{ value: string }>();
    }
    if (!saltRow || !/^[a-f0-9]{32}$/.test(saltRow.value))
      throw new Error("Invalid environment password salt");
    const cached = envVersions.get(env.DB);
    const version =
      cached?.password === env.ADMIN_PASSWORD && cached.salt === saltRow.value
        ? cached.version
        : await hashPassword(env.ADMIN_PASSWORD, saltRow.value);
    envVersions.set(env.DB, {
      password: env.ADMIN_PASSWORD,
      salt: saltRow.value,
      version,
    });
    return { source: "env", password: null, version };
  }
  const rows = await env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN ('admin_credentials', 'admin_password_hash', 'admin_password_salt')",
  ).all<{ key: string; value: string }>();
  const settings = new Map(rows.results.map((row) => [row.key, row.value]));
  const stored = settings.get("admin_credentials");
  if (stored) {
    const password = JSON.parse(stored) as PasswordRecord;
    if (
      !/^[a-f0-9]{64}$/.test(password.hash) ||
      !/^[a-f0-9]{32}$/.test(password.salt) ||
      !/^[a-f0-9]{32}$/.test(password.version)
    ) {
      throw new Error("Invalid stored password configuration");
    }
    return { source: "d1", password, version: password.version };
  }
  // Keep existing installations working; the next password change writes one atomic record.
  const hash = settings.get("admin_password_hash");
  const salt = settings.get("admin_password_salt");
  if (hash || salt) {
    if (
      !hash ||
      !salt ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      !/^[a-f0-9]{32}$/.test(salt)
    )
      throw new Error("Incomplete legacy password configuration");
    const version = await sha256(`legacy:${hash}:${salt}`);
    return { source: "d1", password: { hash, salt, version }, version };
  }
  return { source: "none", password: null, version: null };
}

export async function getAuthMode(
  env: Env,
): Promise<{ mode: "enforced" | "setup_required"; source: AuthSource }> {
  const config = await getAuthConfig(env);
  return {
    mode: config.source === "none" ? "setup_required" : "enforced",
    source: config.source,
  };
}

async function ensureSetupCode(env: Env): Promise<void> {
  const setupCode = randomToken(16);
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('setup_code', ?)",
  )
    .bind(setupCode)
    .run();
  if (inserted.meta.changes > 0) {
    // Only the Cloudflare account owner can read Worker logs or query this private D1 value.
    console.info(
      `Relay first-time setup code: ${setupCode}. Enter it in the setup screen, then choose a password.`,
    );
  }
}

function sessionCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:"
    ? COOKIE_NAME
    : LOCAL_COOKIE_NAME;
}

function extractSession(request: Request): string | null {
  const prefix = `${sessionCookieName(request)}=`;
  const token = request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function cookie(
  request: Request,
  token: string,
  maxAge = SESSION_SECONDS,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function authenticated(
  request: Request,
  env: Env,
  config: AuthConfig,
): Promise<boolean> {
  if (!config.version) return false;
  const token = extractSession(request);
  if (!token) return false;
  const row = await env.DB.prepare(
    "SELECT credential_version, expires_at FROM auth_sessions WHERE token_hash = ?",
  )
    .bind(await sha256(token))
    .first<{ credential_version: string; expires_at: number }>();
  return (
    !!row &&
    row.expires_at > Date.now() &&
    (await timingSafeStringCompare(row.credential_version, config.version))
  );
}

export async function isRequestAuthenticated(
  request: Request,
  env: Env,
): Promise<boolean> {
  return authenticated(request, env, await getAuthConfig(env));
}

async function issueSession(
  request: Request,
  env: Env,
  version: string,
): Promise<Response> {
  if ((await getAuthConfig(env)).version !== version)
    return error(401, "Your password changed. Sign in again.", "unauthorized");
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO auth_sessions (token_hash, credential_version, expires_at) VALUES (?, ?, ?)",
    ).bind(await sha256(token), version, Date.now() + SESSION_SECONDS * 1000),
  ]);
  return json({ ok: true, data: { authenticated: true } }, 200, {
    "Set-Cookie": cookie(request, token),
  });
}

async function throttle(request: Request, env: Env): Promise<Response | null> {
  const now = Date.now();
  // Cloudflare supplies this header on public Worker requests. Never trust X-Forwarded-For.
  const address = request.headers.get("CF-Connecting-IP") || "local";
  const addressKey = `ip:${await sha256(address)}`;
  const keys = [
    { key: addressKey, limit: 8 },
    { key: "global", limit: 100 },
  ];
  const results = await env.DB.batch<{
    attempts: number;
    window_start: number;
  }>([
    ...keys.map(({ key }) =>
      env.DB.prepare(
        `INSERT INTO auth_rate_limits (bucket, attempts, window_start) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN window_start <= ? THEN 1 ELSE attempts + 1 END,
      window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
      RETURNING attempts, window_start`,
      ).bind(key, now, now - RATE_WINDOW_MS, now - RATE_WINDOW_MS),
    ),
    env.DB.prepare("DELETE FROM auth_rate_limits WHERE window_start < ?").bind(
      now - RATE_WINDOW_MS * 2,
    ),
  ]);
  const limited = keys
    .map(({ limit }, index) => ({ limit, row: results[index].results[0] }))
    .find(({ limit, row }) => row && row.attempts > limit);
  if (!limited) return null;
  const retryAfter = Math.max(
    1,
    Math.ceil((limited.row.window_start + RATE_WINDOW_MS - now) / 1000),
  );
  return json(
    {
      ok: false,
      errorCode: 429,
      description: "Too many attempts. Please wait before trying again.",
      reason: "rate_limited",
      retryAfter,
    },
    429,
    { "Retry-After": String(retryAfter) },
  );
}

async function verifyPassword(
  password: string,
  config: AuthConfig,
  env: Env,
): Promise<boolean> {
  if (config.source === "env")
    return timingSafeStringCompare(password, env.ADMIN_PASSWORD || "");
  if (!config.password) return false;
  return timingSafeStringCompare(
    await hashPassword(password, config.password.salt),
    config.password.hash,
  );
}

async function readObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    password.length <= 256 &&
    password.trim().length >= 12
  );
}

export async function handleAuthStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = await getAuthConfig(env);
  if (config.source === "none") await ensureSetupCode(env);
  const data: AuthStatusResponse = {
    mode: config.source === "none" ? "setup_required" : "enforced",
    source: config.source,
    authenticated: await authenticated(request, env, config),
    setupCodeRequired: config.source === "none",
  };
  return json({ ok: true, data });
}

export async function handleAuthLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = await getAuthConfig(env);
  if (config.source === "none")
    return error(403, "Finish setup before signing in.", "unauthorized");
  const limited = await throttle(request, env);
  if (limited) return limited;
  const body = await readObject(request);
  if (
    !body ||
    typeof body.password !== "string" ||
    !body.password ||
    body.password.length > 256
  )
    return error(400, "Enter your password.");
  if (!(await verifyPassword(body.password, config, env)))
    return error(401, "The password is incorrect.", "unauthorized");
  return issueSession(request, env, config.version!);
}

export async function handleAuthSetup(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = await getAuthConfig(env);
  if (config.source !== "none")
    return error(409, "Setup is already complete. Sign in to continue.");
  await ensureSetupCode(env);
  const limited = await throttle(request, env);
  if (limited) return limited;
  const body = await readObject(request);
  if (!body || !validPassword(body.password))
    return error(400, "Choose a password with 12 to 256 characters.");
  if (
    typeof body.setupCode !== "string" ||
    !/^[a-f0-9]{32}$/i.test(body.setupCode.trim())
  )
    return error(400, "Enter the setup code from your Cloudflare account.");
  const setupRow = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'setup_code'",
  ).first<{ value: string }>();
  if (
    !setupRow ||
    !(await timingSafeStringCompare(
      body.setupCode.trim().toLowerCase(),
      setupRow.value,
    ))
  )
    return error(401, "The setup code is incorrect.", "unauthorized");
  const salt = generateSalt();
  const password: PasswordRecord = {
    hash: await hashPassword(body.password, salt),
    salt,
    version: randomToken(16),
  };
  // One record and INSERT OR IGNORE make simultaneous first-time claims safe.
  const claim = await env.DB.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('admin_credentials', ?)",
  )
    .bind(JSON.stringify(password))
    .run();
  if (claim.meta.changes !== 1)
    return error(409, "Setup is already complete. Sign in to continue.");
  await env.DB.prepare(
    "DELETE FROM app_settings WHERE key = 'setup_code'",
  ).run();
  return issueSession(request, env, password.version);
}

export async function handleAuthLogout(
  request: Request,
  env: Env,
): Promise<Response> {
  await ensureAuthSchema(env.DB);
  const token = extractSession(request);
  if (token)
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  return json({ ok: true, data: { authenticated: false } }, 200, {
    "Set-Cookie": cookie(request, "", 0),
  });
}

export async function handleAuthPassword(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = await getAuthConfig(env);
  if (!(await authenticated(request, env, config)))
    return error(401, "Sign in to change your password.", "unauthorized");
  if (config.source === "env")
    return error(
      409,
      "This password is managed by ADMIN_PASSWORD in Cloudflare. Change it there.",
    );
  const limited = await throttle(request, env);
  if (limited) return limited;
  const body = await readObject(request);
  if (!body || !validPassword(body.password))
    return error(400, "Choose a password with 12 to 256 characters.");
  if (
    typeof body.currentPassword !== "string" ||
    body.currentPassword.length > 256 ||
    !(await verifyPassword(body.currentPassword, config, env))
  )
    return error(401, "Your current password is incorrect.", "unauthorized");
  const salt = generateSalt();
  const password: PasswordRecord = {
    hash: await hashPassword(body.password, salt),
    salt,
    version: randomToken(16),
  };
  const updated = await env.DB.prepare(
    `INSERT INTO app_settings (key, value)
    SELECT 'admin_credentials', ? WHERE
      EXISTS (SELECT 1 FROM app_settings WHERE key = 'admin_credentials' AND json_extract(value, '$.version') = ?)
      OR (NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'admin_credentials')
        AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'admin_password_hash' AND value = ?)
        AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'admin_password_salt' AND value = ?))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
    .bind(
      JSON.stringify(password),
      config.version,
      config.password?.hash,
      config.password?.salt,
    )
    .run();
  if (updated.meta.changes !== 1)
    return error(
      409,
      "Your password changed in another session. Sign in again.",
    );
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM app_settings WHERE key IN ('admin_password_hash', 'admin_password_salt', 'auth_secret', 'setup_code')",
    ),
    env.DB.prepare(
      "DELETE FROM auth_sessions WHERE credential_version != ?",
    ).bind(password.version),
  ]);
  return issueSession(request, env, password.version);
}

export async function authenticateApiRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const config = await getAuthConfig(env);
  if (config.source === "none")
    return error(401, "Finish setup to access this workspace.", "unauthorized");
  return (await authenticated(request, env, config))
    ? null
    : error(401, "Sign in to continue.", "unauthorized");
}
