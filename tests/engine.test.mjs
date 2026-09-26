import test from "node:test";
import assert from "node:assert/strict";
import { createD1, loadTypescript } from "./helpers/d1.mjs";

const [{ runTick }, { ensureDatabaseBootstrap }, queries] = await Promise.all([
  loadTypescript("src/jobs/tick.ts"),
  loadTypescript("src/db/bootstrap.ts"),
  loadTypescript("src/db/queries.ts"),
]);

async function fixture(t, mode = "history") {
  const DB = createD1();
  t.after(() => DB.close());
  await ensureDatabaseBootstrap(DB);
  DB.database
    .prepare(
      `INSERT INTO bots (id, token, bot_id, bot_username, label, webhook_secret)
    VALUES ('bot-1', '123456789:TEST_TOKEN_FOR_LOCAL_TESTS_ONLY', 123456789, 'test_bot', 'Test', 'test-secret')`,
    )
    .run();
  const live = mode === "live";
  DB.database
    .prepare(
      `INSERT INTO tasks (id, bot_id, label, source_chat_id, dest_chat_id, scope,
    live_enabled, backfill_status, start_id, end_id, cursor, total, pacing_batch_size)
    VALUES ('task-1', 'bot-1', 'Test copy', '-100111', '-100222', ?, ?, ?, ?, ?, ?, ?, 5)`,
    )
    .run(
      live ? "live" : "backfill_only",
      live ? 1 : 0,
      live ? "not_applicable" : "running",
      live ? null : 1,
      live ? null : 10,
      live ? null : 1,
      live ? null : 10,
    );
  return { DB };
}

function telegram(result) {
  return Response.json({ ok: true, result });
}
function failure(error_code, description, parameters) {
  return Response.json(
    { ok: false, error_code, description, parameters },
    { status: error_code },
  );
}
function method(url) {
  return new URL(url).pathname.split("/").at(-1);
}
function task(env) {
  return env.DB.database
    .prepare("SELECT * FROM tasks WHERE id = 'task-1'")
    .get();
}

for (const route of ["copyMessages", "getUpdates", "copyMessage"]) {
  test(`Telegram ${route} retry_after is preserved beyond two minutes`, async (t) => {
    const env = await fixture(t, route === "copyMessages" ? "history" : "live");
    if (route === "copyMessage") {
      await queries.recordLiveUpdate(env.DB, "bot-1", 100, [
        {
          taskId: "task-1",
          messageId: 42,
          mediaType: "text",
          fileSize: null,
          fileName: null,
        },
      ]);
    }
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
      const action = method(url);
      calls.push(action);
      if (action === route)
        return failure(429, "Too Many Requests: retry after 600", {
          retry_after: 600,
        });
      if (action === "getUpdates") return telegram([]);
      assert.fail(`Unexpected Telegram call: ${action}`);
    });
    const started = Math.floor(Date.now() / 1000);
    await runTick(env);
    const row = task(env);
    assert.ok(
      row.rate_limited_until >= started + 600,
      "cooldown must honor the full Telegram delay",
    );
    assert.ok(row.rate_limited_until <= Math.floor(Date.now() / 1000) + 600);
    assert.equal(row.processed, 0);
    assert.equal(row.live_processed, 0);
    assert.equal(row.cursor, route === "copyMessages" ? 1 : null);
    assert.equal(calls.filter((action) => action === route).length, 1);
    if (route === "copyMessage")
      assert.equal(
        env.DB.database
          .prepare("SELECT count(*) AS n FROM task_pending_messages")
          .get().n,
        1,
        "rate-limited live messages remain queued",
      );
    assert.equal(
      env.DB.database
        .prepare("SELECT polling_lease_token FROM bots WHERE id = 'bot-1'")
        .get().polling_lease_token,
      null,
    );
  });
}

test("ambiguous partial batch stops visibly without advancing or counting the range", async (t) => {
  const env = await fixture(t);
  let copies = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(method(url), "copyMessages");
    copies++;
    return failure(400, "Bad Request: failed to send message #3");
  });
  await runTick(env);
  const row = task(env);
  assert.equal(row.cursor, 1);
  assert.equal(row.processed, 0);
  assert.equal(
    row.failed,
    0,
    "an uncertain outcome must not mark unattempted messages as failed",
  );
  assert.equal(row.backfill_status, "failed");
  assert.equal(row.stop_reason, "invalid_request");
  assert.match(
    env.DB.database
      .prepare("SELECT detail FROM task_activity_log ORDER BY id DESC LIMIT 1")
      .get().detail,
    /not advanced/,
  );
  await runTick(env);
  assert.equal(
    copies,
    1,
    "a stopped ambiguous batch must wait for user review",
  );
});

test("overlapping ticks share a bot lease across polling and delivery", async (t) => {
  const env = await fixture(t, "live");
  let releasePoll;
  let reachedPoll;
  const pollReached = new Promise((resolve) => {
    reachedPoll = resolve;
  });
  const pollRelease = new Promise((resolve) => {
    releasePoll = resolve;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const action = method(url);
    calls.push(action);
    if (action === "getUpdates") {
      reachedPoll();
      await pollRelease;
      return telegram([
        {
          update_id: 101,
          channel_post: {
            message_id: 42,
            date: 1720000000,
            chat: { id: -100111, type: "channel", title: "Source" },
            text: "Hello",
          },
        },
      ]);
    }
    if (action === "copyMessage") {
      assert.equal(JSON.parse(options.body).message_id, 42);
      return telegram({ message_id: 600 });
    }
    assert.fail(`Unexpected Telegram call: ${action}`);
  });
  const first = runTick(env);
  await pollReached;
  const token = env.DB.database
    .prepare("SELECT polling_lease_token FROM bots WHERE id = 'bot-1'")
    .get().polling_lease_token;
  assert.ok(token);
  await runTick(env);
  assert.equal(
    calls.filter((action) => action === "getUpdates").length,
    1,
    "another tick cannot consume the same update queue",
  );
  releasePoll();
  await first;
  assert.deepEqual(calls, ["getUpdates", "copyMessage"]);
  assert.equal(task(env).live_processed, 1);
  assert.equal(
    env.DB.database
      .prepare("SELECT count(*) AS n FROM task_pending_messages")
      .get().n,
    0,
  );
  assert.equal(
    env.DB.database
      .prepare("SELECT last_update_id FROM bots WHERE id = 'bot-1'")
      .get().last_update_id,
    101,
  );
});

test("bot lease ownership prevents a stale worker from releasing a successor lease", async (t) => {
  const env = await fixture(t, "live");
  assert.equal(
    await queries.claimBotPoll(env.DB, "bot-1", "first-worker", 240),
    true,
  );
  assert.equal(
    await queries.claimBotPoll(env.DB, "bot-1", "second-worker", 240),
    false,
  );
  env.DB.database
    .prepare(
      "UPDATE bots SET polling_lease_expires_at = unixepoch() - 1 WHERE id = 'bot-1'",
    )
    .run();
  assert.equal(
    await queries.claimBotPoll(env.DB, "bot-1", "second-worker", 240),
    true,
  );
  await queries.releaseBotPoll(env.DB, "bot-1", "first-worker");
  assert.equal(
    env.DB.database
      .prepare("SELECT polling_lease_token FROM bots WHERE id = 'bot-1'")
      .get().polling_lease_token,
    "second-worker",
  );
  await queries.releaseBotPoll(env.DB, "bot-1", "second-worker");
  assert.equal(
    env.DB.database
      .prepare("SELECT polling_lease_token FROM bots WHERE id = 'bot-1'")
      .get().polling_lease_token,
    null,
  );
});

test("redelivered live updates cannot duplicate messages or skipped counters", async (t) => {
  const env = await fixture(t, "live");
  const entry = {
    taskId: "task-1",
    messageId: 42,
    mediaType: "text",
    fileSize: null,
    fileName: null,
  };
  await queries.recordLiveUpdate(env.DB, "bot-1", 101, [entry]);
  await queries.recordLiveUpdate(env.DB, "bot-1", 101, [entry]);
  await queries.recordLiveUpdate(env.DB, "bot-1", 102, [entry]);
  assert.equal(
    env.DB.database
      .prepare("SELECT count(*) AS n FROM task_pending_messages")
      .get().n,
    1,
  );
  await queries.recordLiveUpdate(env.DB, "bot-1", 103, [
    { ...entry, messageId: 43, skippedReason: "Filtered" },
  ]);
  await queries.recordLiveUpdate(env.DB, "bot-1", 103, [
    { ...entry, messageId: 43, skippedReason: "Filtered" },
  ]);
  await queries.recordLiveUpdate(env.DB, "bot-1", 100, []);
  assert.equal(task(env).live_skipped, 1);
  assert.equal(
    env.DB.database
      .prepare("SELECT last_update_id FROM bots WHERE id = 'bot-1'")
      .get().last_update_id,
    103,
    "older updates cannot roll back the offset",
  );
});

test("queue and update offset commit together when a database write fails", async (t) => {
  const env = await fixture(t, "live");
  env.DB.database
    .exec(`CREATE TRIGGER reject_test_message BEFORE INSERT ON task_pending_messages
    WHEN NEW.message_id = 44 BEGIN SELECT RAISE(ABORT, 'injected queue failure'); END`);
  const entries = [42, 44].map((messageId) => ({
    taskId: "task-1",
    messageId,
    mediaType: "text",
    fileSize: null,
    fileName: null,
  }));
  await assert.rejects(
    () => queries.recordLiveUpdate(env.DB, "bot-1", 104, entries),
    /injected queue failure/,
  );
  assert.equal(
    env.DB.database
      .prepare("SELECT count(*) AS n FROM task_pending_messages")
      .get().n,
    0,
    "earlier queue writes roll back when a later one fails",
  );
  assert.equal(
    env.DB.database
      .prepare("SELECT last_update_id FROM bots WHERE id = 'bot-1'")
      .get().last_update_id,
    0,
    "Telegram updates stay unacknowledged after failed queue writes",
  );
});

test("paused history never resumes merely because live copying is enabled", async (t) => {
  const env = await fixture(t);
  env.DB.database
    .prepare(
      "UPDATE tasks SET scope = 'live_and_backfill', live_enabled = 1, backfill_status = 'paused'",
    )
    .run();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(method(url));
    return telegram([]);
  });
  await runTick(env);
  assert.deepEqual(calls, ["getUpdates"]);
  assert.equal(task(env).cursor, 1);
  assert.equal(task(env).backfill_status, "paused");
});
