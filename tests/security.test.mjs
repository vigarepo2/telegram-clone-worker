import assert from "node:assert/strict";
import { Database } from "./helpers/d1.mjs";
import { test } from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

function environment(extra = {}) {
  return {
    DB: new Database(),
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><title>Relay</title>", {
          headers: { "Content-Type": "text/html" },
        }),
    },
    ...extra,
  };
}
function request(
  path,
  {
    method = "GET",
    body,
    cookie,
    origin = "https://relay.example",
    ip = "192.0.2.1",
    headers = {},
  } = {},
) {
  const finalHeaders = { "CF-Connecting-IP": ip, ...headers };
  if (method !== "GET" && origin !== null) finalHeaders.Origin = origin;
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (cookie) finalHeaders.Cookie = cookie;
  return new Request(`https://relay.example${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function call(env, path, options) {
  return worker.fetch(request(path, options), env);
}
async function createOwner(env, ip = "192.0.2.1") {
  const status = await call(env, "/api/auth/status");
  assert.equal(status.status, 200);
  const code = env.DB.sqlite
    .prepare("SELECT value FROM app_settings WHERE key = 'setup_code'")
    .get()?.value;
  assert.ok(code);
  const response = await call(env, "/api/auth/setup", {
    method: "POST",
    body: { setupCode: code, password: "correct horse battery staple" },
    ip,
  });
  assert.equal(response.status, 200);
  return response.headers.get("Set-Cookie").split(";")[0];
}
const password = "correct horse battery staple";

test("new deployment stays locked; private setup proof is required and never returned", async () => {
  const env = environment();
  assert.equal((await call(env, "/api/tasks")).status, 401);
  const response = await call(env, "/api/auth/status");
  const status = await response.json();
  assert.equal(status.data.mode, "setup_required");
  assert.equal(status.data.authenticated, false);
  assert.equal(status.data.setupCodeRequired, true);
  assert.equal(JSON.stringify(status).includes("setup_code"), false);
  assert.equal(
    (await call(env, "/api/auth/login", { method: "POST", body: { password } }))
      .status,
    403,
  );
  assert.equal(
    (
      await call(env, "/api/auth/setup", {
        method: "POST",
        body: { password, setupCode: "0".repeat(32) },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(env, "/api/auth/setup", {
        method: "POST",
        body: { password: "short", setupCode: "0".repeat(32) },
      })
    ).status,
    400,
  );
});

test("setup issues a secure cookie, stores only token hashes and refuses replacement claims", async () => {
  const env = environment();
  await call(env, "/api/auth/status");
  const setupCode = env.DB.sqlite
    .prepare("SELECT value FROM app_settings WHERE key = 'setup_code'")
    .get().value;
  const response = await call(env, "/api/auth/setup", {
    method: "POST",
    body: { password, setupCode },
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie");
  for (const flag of [
    "__Host-relay_session=",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
  ])
    assert.ok(cookie.includes(flag));
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { authenticated: true },
  });
  assert.equal(
    env.DB.sqlite
      .prepare("SELECT value FROM app_settings WHERE key = 'setup_code'")
      .get(),
    undefined,
  );
  const token = cookie.split(";")[0].split("=")[1];
  const stored = env.DB.sqlite
    .prepare("SELECT token_hash FROM auth_sessions")
    .get().token_hash;
  assert.notEqual(stored, token);
  assert.equal(
    (await (await call(env, "/api/auth/status", { cookie })).json()).data
      .authenticated,
    true,
  );
  assert.equal(
    (
      await call(env, "/api/auth/setup", {
        method: "POST",
        body: { password, setupCode },
      })
    ).status,
    409,
  );
});

test("two simultaneous setup attempts create one owner only", async () => {
  const env = environment();
  await call(env, "/api/auth/status");
  const setupCode = env.DB.sqlite
    .prepare("SELECT value FROM app_settings WHERE key = 'setup_code'")
    .get().value;
  const responses = await Promise.all(
    [1, 2].map((value) =>
      call(env, "/api/auth/setup", {
        method: "POST",
        body: { password: `${password}-${value}`, setupCode },
        ip: `192.0.2.${value}`,
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal(
    env.DB.sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM app_settings WHERE key = 'admin_credentials'",
      )
      .get().count,
    1,
  );
});

test("cross-origin requests and non-JSON mutation bodies are rejected before routes run", async () => {
  const env = environment();
  assert.equal(
    (
      await call(env, "/api/auth/setup", {
        method: "POST",
        origin: "https://attacker.example",
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(env, "/api/auth/setup", {
        method: "POST",
        origin: null,
        body: {},
      })
    ).status,
    403,
  );
  const form = new Request("https://relay.example/api/auth/setup", {
    method: "POST",
    headers: { Origin: "https://relay.example", "Content-Type": "text/plain" },
    body: "{}",
  });
  assert.equal((await worker.fetch(form, env)).status, 415);
  const badJson = new Request("https://relay.example/api/auth/setup", {
    method: "POST",
    headers: {
      Origin: "https://relay.example",
      "Content-Type": "application/json",
    },
    body: "{broken",
  });
  assert.equal((await worker.fetch(badJson, env)).status, 400);
  assert.equal(
    (
      await call(env, "/api/auth/setup", {
        method: "POST",
        body: { value: "a".repeat(65536) },
      })
    ).status,
    413,
  );
});

test("logout revokes the server-side session and bearer tokens are not accepted", async () => {
  const env = environment();
  const cookie = await createOwner(env);
  assert.equal((await call(env, "/api/tasks", { cookie })).status, 200);
  assert.equal(
    (
      await call(env, "/api/tasks", {
        headers: { Authorization: `Bearer ${cookie.split("=")[1]}` },
      })
    ).status,
    401,
  );
  const response = await call(env, "/api/auth/logout", {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("Set-Cookie").includes("Max-Age=0"));
  assert.equal((await call(env, "/api/tasks", { cookie })).status, 401);
});

test("password change invalidates every previous session and requires the existing password", async () => {
  const env = environment();
  const first = await createOwner(env);
  const login = await call(env, "/api/auth/login", {
    method: "POST",
    body: { password },
  });
  const second = login.headers.get("Set-Cookie").split(";")[0];
  assert.equal(
    (
      await call(env, "/api/auth/password", {
        method: "POST",
        cookie: first,
        body: { password: `${password} changed`, currentPassword: "wrong" },
      })
    ).status,
    401,
  );
  const changed = await call(env, "/api/auth/password", {
    method: "POST",
    cookie: first,
    body: { password: `${password} changed`, currentPassword: password },
  });
  assert.equal(changed.status, 200);
  assert.equal((await call(env, "/api/tasks", { cookie: first })).status, 401);
  assert.equal((await call(env, "/api/tasks", { cookie: second })).status, 401);
  assert.equal(
    (
      await call(env, "/api/tasks", {
        cookie: changed.headers.get("Set-Cookie"),
      })
    ).status,
    200,
  );
});

test("rate limits persist across requests in D1 and include a retry delay", async () => {
  const env = environment();
  await createOwner(env);
  for (let attempt = 0; attempt < 8; attempt++) {
    assert.equal(
      (
        await call(env, "/api/auth/login", {
          method: "POST",
          body: { password: "wrong" },
          ip: "192.0.2.99",
        })
      ).status,
      401,
    );
  }
  const response = await call(env, "/api/auth/login", {
    method: "POST",
    body: { password },
    ip: "192.0.2.99",
  });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  assert.equal((await response.json()).reason, "rate_limited");
});

test("database failures fail closed with safe JSON, never anonymous access", async () => {
  const env = environment();
  const cookie = await createOwner(env);
  env.DB.unavailable = true;
  const response = await call(env, "/api/tasks", { cookie });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
  const freshEnv = environment();
  freshEnv.DB.unavailable = true;
  assert.equal((await call(freshEnv, "/api/auth/status")).status, 503);
  assert.equal(
    (await call(environment({ DB: undefined }), "/api/auth/status")).status,
    503,
  );
});

test("expired sessions and corrupt password configuration remain locked", async () => {
  const env = environment();
  const cookie = await createOwner(env);
  env.DB.sqlite.exec("UPDATE auth_sessions SET expires_at = 1");
  assert.equal((await call(env, "/api/tasks", { cookie })).status, 401);
  env.DB.sqlite.exec(
    "UPDATE app_settings SET value = 'not-json' WHERE key = 'admin_credentials'",
  );
  assert.equal((await call(env, "/api/auth/status")).status, 503);
});

test("API responses are private, framed pages are blocked, HTTP is upgraded", async () => {
  const response = await call(environment(), "/api/auth/status");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.ok(
    response.headers
      .get("Content-Security-Policy")
      .includes("frame-ancestors 'none'"),
  );
  const redirect = await worker.fetch(
    new Request("http://relay.example/"),
    environment(),
  );
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("Location"), "https://relay.example/");
});

test("legacy D1 passwords continue to sign in and migrate on password change", async () => {
  const { pbkdf2Sync } = await import("node:crypto");
  const env = environment();
  await call(env, "/api/auth/status");
  const salt = "a".repeat(32);
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  env.DB.sqlite
    .prepare(
      "INSERT INTO app_settings (key, value) VALUES ('admin_password_hash', ?), ('admin_password_salt', ?)",
    )
    .run(hash, salt);
  const login = await call(env, "/api/auth/login", {
    method: "POST",
    body: { password },
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie");
  const changed = await call(env, "/api/auth/password", {
    method: "POST",
    cookie,
    body: { currentPassword: password, password: `${password} updated` },
  });
  assert.equal(changed.status, 200);
  assert.ok(
    env.DB.sqlite
      .prepare("SELECT value FROM app_settings WHERE key = 'admin_credentials'")
      .get(),
  );
  assert.equal(
    env.DB.sqlite
      .prepare(
        "SELECT value FROM app_settings WHERE key = 'admin_password_hash'",
      )
      .get(),
    undefined,
  );
  assert.equal((await call(env, "/api/tasks", { cookie })).status, 401);
});

test("optional ADMIN_PASSWORD stays supported and changing it revokes old sessions", async () => {
  const env = environment({ ADMIN_PASSWORD: password });
  const status = await (await call(env, "/api/auth/status")).json();
  assert.equal(status.data.source, "env");
  assert.equal(status.data.mode, "enforced");
  assert.equal(status.data.setupCodeRequired, false);
  const login = await call(env, "/api/auth/login", {
    method: "POST",
    body: { password },
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie");
  assert.equal(
    (
      await call(env, "/api/auth/password", {
        method: "POST",
        cookie,
        body: { currentPassword: password, password: `${password} updated` },
      })
    ).status,
    409,
  );
  env.ADMIN_PASSWORD = `${password} replaced`;
  assert.equal((await call(env, "/api/tasks", { cookie })).status, 401);
  assert.equal(
    (
      await call(env, "/api/auth/login", {
        method: "POST",
        body: { password: env.ADMIN_PASSWORD },
      })
    ).status,
    200,
  );
});

test("concurrent password changes cannot overwrite a newer password", async () => {
  const env = environment();
  const cookie = await createOwner(env);
  const responses = await Promise.all(
    [1, 2].map((value) =>
      call(env, "/api/auth/password", {
        method: "POST",
        cookie,
        body: {
          currentPassword: password,
          password: `${password} changed ${value}`,
        },
        ip: `192.0.2.${value}`,
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  const winner = responses.find((response) => response.status === 200);
  assert.equal(
    (
      await call(env, "/api/tasks", {
        cookie: winner.headers.get("Set-Cookie"),
      })
    ).status,
    200,
  );
});

test("login using a stale password snapshot does not delete a newer session", async () => {
  const env = environment();
  await createOwner(env);
  const newVersion = "b".repeat(32);
  const originalPrepare = env.DB.prepare.bind(env.DB);
  let changed = false;
  env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (
      !changed &&
      sql.includes(
        "SELECT key, value FROM app_settings WHERE key IN ('admin_credentials'",
      )
    ) {
      const originalAll = statement.all.bind(statement);
      statement.all = async () => {
        const result = await originalAll();
        const record = JSON.parse(
          env.DB.sqlite
            .prepare(
              "SELECT value FROM app_settings WHERE key = 'admin_credentials'",
            )
            .get().value,
        );
        record.version = newVersion;
        env.DB.sqlite
          .prepare(
            "UPDATE app_settings SET value = ? WHERE key = 'admin_credentials'",
          )
          .run(JSON.stringify(record));
        env.DB.sqlite
          .prepare(
            "INSERT INTO auth_sessions (token_hash, credential_version, expires_at) VALUES (?, ?, ?)",
          )
          .run("c".repeat(64), newVersion, Date.now() + 60000);
        changed = true;
        return result;
      };
    }
    return statement;
  };
  const response = await call(env, "/api/auth/login", {
    method: "POST",
    body: { password },
  });
  assert.equal(response.status, 401);
  assert.equal(
    env.DB.sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM auth_sessions WHERE credential_version = ?",
      )
      .get(newVersion).count,
    1,
  );
});

test("message probe is never triggered through an authenticated GET", async () => {
  const env = environment();
  const cookie = await createOwner(env);
  const response = await call(
    env,
    "/api/chats/-100123/latest-message-id?botId=test",
    { cookie },
  );
  assert.equal(response.status, 404);
});
