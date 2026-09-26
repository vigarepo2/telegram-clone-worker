import test from "node:test";
import assert from "node:assert/strict";
import { createD1, loadTypescript } from "./helpers/d1.mjs";

const { default: worker } = await loadTypescript("src/index.ts");
const { DEFAULT_PREFERENCES, COLOR_MODES } = await loadTypescript(
  "src/shared/preferences.ts",
);
const password = "workspace preferences password";
const origin = "https://workspace.example";

function call(
  env,
  path,
  { method = "GET", body, cookie, requestOrigin = origin } = {},
) {
  const headers = { "CF-Connecting-IP": "192.0.2.21" };
  if (method !== "GET") headers.Origin = requestOrigin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(
    new Request(`${origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}
async function fixture(t) {
  const env = { DB: createD1(), ADMIN_PASSWORD: password };
  t.after(() => env.DB.close());
  const response = await call(env, "/api/auth/login", {
    method: "POST",
    body: { password },
  });
  assert.equal(response.status, 200);
  return { env, cookie: response.headers.get("Set-Cookie").split(";")[0] };
}
async function preferences(env, cookie) {
  const response = await call(env, "/api/preferences", { cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json();
  assert.equal(result.ok, true);
  return result.data;
}

test("preferences require authentication for reads and writes, including before setup", async (t) => {
  const env = { DB: createD1() };
  t.after(() => env.DB.close());
  assert.equal((await call(env, "/api/preferences")).status, 401);
  assert.equal(
    (
      await call(env, "/api/preferences", {
        method: "PATCH",
        body: { colorMode: "dark" },
      })
    ).status,
    401,
  );
  const configured = await fixture(t);
  assert.equal((await call(configured.env, "/api/preferences")).status, 401);
  assert.equal(
    (
      await call(configured.env, "/api/preferences", {
        method: "PATCH",
        body: { colorMode: "dark" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await preferences(configured.env, configured.cookie)).colorMode,
    "system",
  );
});

test("new workspaces follow the system appearance by default without exposing app settings", async (t) => {
  const { env, cookie } = await fixture(t);
  env.DB.sqlite
    .prepare(
      "INSERT INTO app_settings (key, value) VALUES ('unrelated_secret', 'private-value')",
    )
    .run();
  const result = await preferences(env, cookie);
  assert.deepEqual(result, {
    colorMode: "system",
    density: "comfortable",
    textSize: "standard",
    reduceMotion: false,
    showTaskStats: true,
    defaultTaskScope: "live",
    defaultSaveSetup: false,
  });
  assert.deepEqual(result, DEFAULT_PREFERENCES);
  assert.equal(JSON.stringify(result).includes("private-value"), false);
});

test("partial preference changes preserve other saved fields", async (t) => {
  const { env, cookie } = await fixture(t);
  const first = await call(env, "/api/preferences", {
    method: "PATCH",
    cookie,
    body: {
      colorMode: "dark",
      density: "compact",
      reduceMotion: true,
      defaultTaskScope: "live_and_backfill",
    },
  });
  assert.equal(first.status, 200);
  const second = await call(env, "/api/preferences", {
    method: "PATCH",
    cookie,
    body: { textSize: "large", defaultSaveSetup: true },
  });
  assert.equal(second.status, 200);
  assert.deepEqual((await second.json()).data, {
    ...DEFAULT_PREFERENCES,
    colorMode: "dark",
    density: "compact",
    reduceMotion: true,
    defaultTaskScope: "live_and_backfill",
    textSize: "large",
    defaultSaveSetup: true,
  });
  assert.deepEqual(await preferences(env, cookie), {
    ...DEFAULT_PREFERENCES,
    colorMode: "dark",
    density: "compact",
    reduceMotion: true,
    defaultTaskScope: "live_and_backfill",
    textSize: "large",
    defaultSaveSetup: true,
  });
});

test("preferences survive logout, a fresh session and a new environment object", async (t) => {
  const { env, cookie } = await fixture(t);
  const saved = {
    colorMode: "dark",
    density: "compact",
    showTaskStats: false,
    defaultSaveSetup: true,
  };
  assert.equal(
    (
      await call(env, "/api/preferences", {
        method: "PATCH",
        cookie,
        body: saved,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(env, "/api/auth/logout", { method: "POST", cookie, body: {} }))
      .status,
    200,
  );
  assert.equal((await call(env, "/api/preferences", { cookie })).status, 401);
  const freshEnv = { DB: env.DB, ADMIN_PASSWORD: password };
  const login = await call(freshEnv, "/api/auth/login", {
    method: "POST",
    body: { password },
  });
  assert.equal(login.status, 200);
  const freshCookie = login.headers.get("Set-Cookie").split(";")[0];
  assert.notEqual(cookie, freshCookie);
  assert.deepEqual(await preferences(freshEnv, freshCookie), {
    ...DEFAULT_PREFERENCES,
    ...saved,
  });
});

test("unknown settings, wrong types and obsolete theme fields are rejected atomically", async (t) => {
  const { env, cookie } = await fixture(t);
  const invalidBodies = [
    { colorMode: "canvas" },
    { colorMode: "harbor" },
    { colorMode: "sepia" },
    { colorMode: null },
    { colorMode: true },
    { colorMode: "Light" },
    { themeId: "canvas" },
    { themeId: "harbor" },
    { density: "dense" },
    { textSize: 2 },
    { reduceMotion: "true" },
    { showTaskStats: 0 },
    { defaultTaskScope: "all" },
    { defaultSaveSetup: "false" },
    { extra: true },
    { colorMode: "dark", textSize: "tiny" },
    { colorMode: "dark", admin_password_hash: "overwrite" },
    [],
    null,
    "system",
    JSON.parse('{"__proto__":{"colorMode":"dark"}}'),
  ];
  for (const body of invalidBodies) {
    const response = await call(env, "/api/preferences", {
      method: "PATCH",
      cookie,
      body,
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).ok, false);
  }
  assert.deepEqual(await preferences(env, cookie), DEFAULT_PREFERENCES);
  assert.equal(
    env.DB.sqlite
      .prepare(
        "SELECT count(*) AS count FROM app_settings WHERE key LIKE 'workspace_preference:%'",
      )
      .get().count,
    0,
  );
});

test("system, light and dark appearance choices can be saved and returned", async (t) => {
  const { env, cookie } = await fixture(t);
  assert.deepEqual(COLOR_MODES, ["system", "light", "dark"]);
  for (const colorMode of COLOR_MODES) {
    const response = await call(env, "/api/preferences", {
      method: "PATCH",
      cookie,
      body: { colorMode },
    });
    assert.equal(response.status, 200, colorMode);
    assert.equal((await response.json()).data.colorMode, colorMode);
  }
});

test("simultaneous patches of different settings preserve every change", async (t) => {
  const { env, cookie } = await fixture(t);
  const patches = [
    { colorMode: "light" },
    { textSize: "large" },
    { density: "compact" },
    { reduceMotion: true },
    { defaultTaskScope: "backfill_only" },
  ];
  const responses = await Promise.all(
    patches.map((body) =>
      call(env, "/api/preferences", { method: "PATCH", cookie, body }),
    ),
  );
  assert.ok(responses.every((response) => response.status === 200));
  assert.deepEqual(
    await preferences(env, cookie),
    Object.assign({}, DEFAULT_PREFERENCES, ...patches),
  );
});

test("invalid stored appearance values fall back independently and unrelated rows stay private", async (t) => {
  const { env, cookie } = await fixture(t);
  for (const [key, value] of [
    ["colorMode", '"obsolete-mode"'],
    ["density", '"compact"'],
    ["textSize", "not-json"],
    ["reduceMotion", '"true"'],
  ])
    env.DB.sqlite
      .prepare("INSERT INTO app_settings(key,value) VALUES (?,?)")
      .run(`workspace_preference:${key}`, value);
  env.DB.sqlite
    .prepare(
      "INSERT INTO app_settings(key,value) VALUES ('workspace_preference:unknownSecret','private')",
    )
    .run();
  assert.deepEqual(await preferences(env, cookie), {
    ...DEFAULT_PREFERENCES,
    density: "compact",
  });
});

test("cross-origin writes and database outages do not silently reset preferences", async (t) => {
  const { env, cookie } = await fixture(t);
  assert.equal(
    (
      await call(env, "/api/preferences", {
        method: "PATCH",
        cookie,
        body: { colorMode: "dark" },
        requestOrigin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(env, "/api/preferences", {
        method: "PATCH",
        cookie,
        body: { colorMode: "dark" },
      })
    ).status,
    200,
  );
  env.DB.unavailable = true;
  assert.equal((await call(env, "/api/preferences", { cookie })).status, 503);
  assert.equal(
    (
      await call(env, "/api/preferences", {
        method: "PATCH",
        cookie,
        body: { colorMode: "system" },
      })
    ).status,
    503,
  );
  env.DB.unavailable = false;
  assert.equal((await preferences(env, cookie)).colorMode, "dark");
});

test("obsolete saved theme IDs stay harmless and do not change the new appearance default", async (t) => {
  const { env, cookie } = await fixture(t);
  env.DB.sqlite
    .prepare(
      "INSERT INTO app_settings(key,value) VALUES ('workspace_preference:themeId', ?)",
    )
    .run('"cinema"');
  const result = await preferences(env, cookie);
  assert.equal(result.colorMode, "system");
  assert.equal(Object.hasOwn(result, "themeId"), false);
  const saved = await call(env, "/api/preferences", {
    method: "PATCH",
    cookie,
    body: { colorMode: "dark" },
  });
  assert.equal(saved.status, 200);
  assert.equal((await preferences(env, cookie)).colorMode, "dark");
  assert.equal(
    env.DB.sqlite
      .prepare(
        "SELECT value FROM app_settings WHERE key = 'workspace_preference:themeId'",
      )
      .get().value,
    '"cinema"',
  );
});
