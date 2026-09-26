import test from "node:test";
import assert from "node:assert/strict";
import { createD1, loadTypescript } from "./helpers/d1.mjs";
const { default: worker } = await loadTypescript("src/index.ts");
const { insertBot, insertTask } = await loadTypescript("src/db/queries.ts");
const origin = "https://workspace.example";
const token = "123456789:abcdefghijklmnopqrstuvwxyz123456789";
const task = {
  id: "task-delete",
  bot_id: "bot-delete",
  label: "Delete this task",
  source_chat_id: "-100123456",
  source_chat_title: null,
  dest_chat_id: "-100987654",
  dest_chat_title: null,
  scope: "live",
  live_enabled: false,
  backfill_mode: null,
  start_id: null,
  end_id: null,
  cursor: null,
  total: null,
  backfill_status: "not_applicable",
  pacing_batch_size: 20,
};
async function fixture(t) {
  const env = { DB: createD1(), ADMIN_PASSWORD: "delete tests password" };
  t.after(() => env.DB.close());
  const login = await worker.fetch(
    new Request(origin + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
    }),
    env,
  );
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  await insertBot(env.DB, {
    id: task.bot_id,
    token,
    bot_id: 123456789,
    bot_username: "delete_test_bot",
    label: "Local test",
    webhook_secret: "unused",
  });
  await insertTask(env.DB, task);
  const call = (
    path,
    {
      method = "GET",
      body,
      cookieValue = cookie,
      requestOrigin = origin,
      contentType = "application/json",
      headers = {},
    } = {},
  ) =>
    worker.fetch(
      new Request(origin + path, {
        method,
        headers: {
          Origin: requestOrigin,
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(cookieValue ? { Cookie: cookieValue } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body, duplex: "half" } : {}),
      }),
      env,
    );
  return { env, call };
}
function emptyStream() {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

test("task DELETE accepts absent, empty streamed, zero-byte, and JSON request bodies", async (t) => {
  const { env, call } = await fixture(t);
  const cases = [
    { body: undefined },
    { body: new Uint8Array(0) },
    { body: emptyStream() },
    { body: emptyStream(), contentType: null },
    { body: "{}" },
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = `delete-${i}`;
    await insertTask(env.DB, { ...task, id });
    const route =
      i % 2 ? `/api/bots/${task.bot_id}/tasks/${id}` : `/api/tasks/${id}`;
    const response = await call(route, { method: "DELETE", ...cases[i] });
    assert.equal(
      response.status,
      200,
      `Body case ${i}: ${await response.clone().text()}`,
    );
    assert.deepEqual(await response.json(), { ok: true, data: null });
    assert.equal(
      await env.DB.prepare("SELECT id FROM tasks WHERE id=?").bind(id).first(),
      null,
    );
  }
  assert.ok(
    await env.DB.prepare("SELECT id FROM tasks WHERE id=?")
      .bind(task.id)
      .first(),
  );
});

test("deleting a task clears queued messages and activity but preserves its saved setup and other tasks", async (t) => {
  const { env, call } = await fixture(t);
  await insertTask(env.DB, { ...task, id: "task-keep" });
  await env.DB.prepare(
    "INSERT INTO task_pending_messages(task_id,message_id) VALUES (?,?)",
  )
    .bind(task.id, 9)
    .run();
  await env.DB.prepare(
    "INSERT INTO task_activity_log(task_id,kind,ok,detail) VALUES (?,'live_forward',1,'Test activity')",
  )
    .bind(task.id)
    .run();
  const saved = await call("/api/saved-tasks", {
    method: "POST",
    body: JSON.stringify({ task_id: task.id }),
  });
  assert.equal(saved.status, 201);
  const savedId = (await saved.json()).data.id;
  assert.equal(
    (
      await call(`/api/tasks/${task.id}`, {
        method: "DELETE",
        body: new Uint8Array(0),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM task_pending_messages WHERE task_id=?",
      )
        .bind(task.id)
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM task_activity_log WHERE task_id=?",
      )
        .bind(task.id)
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await env.DB.prepare("SELECT task_id FROM saved_tasks WHERE id=?")
        .bind(savedId)
        .first()
    ).task_id,
    null,
  );
  assert.ok(
    await env.DB.prepare("SELECT id FROM tasks WHERE id='task-keep'").first(),
  );
  assert.equal(
    (await call(`/api/tasks/${task.id}`, { method: "DELETE", body: "{}" }))
      .status,
    200,
  );
});

test("empty DELETE still requires authentication and same origin; invalid bodies never delete data", async (t) => {
  const { env, call } = await fixture(t);
  const cases = [
    { options: { body: emptyStream(), cookieValue: null }, status: 401 },
    {
      options: { body: emptyStream(), requestOrigin: "https://other.example" },
      status: 403,
    },
    {
      options: {
        body: emptyStream(),
        headers: { "Sec-Fetch-Site": "cross-site" },
      },
      status: 403,
    },
    { options: { body: "{broken" }, status: 400 },
    { options: { body: " " }, status: 400 },
    { options: { body: "[]" }, status: 400 },
    { options: { body: "{}", contentType: "text/plain" }, status: 415 },
    {
      options: { body: JSON.stringify({ value: "a".repeat(65536) }) },
      status: 413,
    },
  ];
  for (const { options, status } of cases) {
    assert.equal(
      (await call(`/api/tasks/${task.id}`, { method: "DELETE", ...options }))
        .status,
      status,
    );
    assert.ok(
      await env.DB.prepare("SELECT id FROM tasks WHERE id=?")
        .bind(task.id)
        .first(),
    );
  }
});

test("saved setups and bots can also be deleted using an empty request stream", async (t) => {
  const { env, call } = await fixture(t);
  const saved = await call("/api/saved-tasks", {
    method: "POST",
    body: JSON.stringify({ task_id: task.id }),
  });
  const savedId = (await saved.json()).data.id;
  assert.equal(
    (
      await call(`/api/saved-tasks/${savedId}`, {
        method: "DELETE",
        body: emptyStream(),
      })
    ).status,
    200,
  );
  assert.equal(
    await env.DB.prepare("SELECT id FROM saved_tasks WHERE id=?")
      .bind(savedId)
      .first(),
    null,
  );
  assert.ok(
    await env.DB.prepare("SELECT id FROM tasks WHERE id=?")
      .bind(task.id)
      .first(),
  );
  assert.equal(
    (
      await call(`/api/bots/${task.bot_id}`, {
        method: "DELETE",
        body: emptyStream(),
      })
    ).status,
    200,
  );
  assert.equal(
    await env.DB.prepare("SELECT id FROM bots WHERE id=?")
      .bind(task.bot_id)
      .first(),
    null,
  );
  assert.equal(
    await env.DB.prepare("SELECT id FROM tasks WHERE id=?")
      .bind(task.id)
      .first(),
    null,
  );
});
