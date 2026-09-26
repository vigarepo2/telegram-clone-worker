import test from "node:test";
import assert from "node:assert/strict";
import { createD1, loadTypescript } from "./helpers/d1.mjs";

const [{ runTick }, { ensureDatabaseBootstrap }, queries, savedTasks] =
  await Promise.all([
    loadTypescript("src/jobs/tick.ts"),
    loadTypescript("src/db/bootstrap.ts"),
    loadTypescript("src/db/queries.ts"),
    loadTypescript("src/routes/api/savedTasks.ts"),
  ]);

test("legacy extension selections do not filter live messages or carry into presets", async (t) => {
  const DB = createD1();
  t.after(() => DB.close());
  await ensureDatabaseBootstrap(DB);
  await queries.insertBot(DB, {
    id: "bot-1",
    token: "123456789:TEST_TOKEN_FOR_LOCAL_TESTS_ONLY",
    bot_id: 123456789,
    bot_username: "test_bot",
    label: "Test",
    webhook_secret: "test-secret",
  });
  await queries.insertTask(DB, {
    id: "task-1",
    bot_id: "bot-1",
    label: "Existing copy",
    source_chat_id: "-100111",
    source_chat_title: "Source",
    dest_chat_id: "-100222",
    dest_chat_title: "Destination",
    scope: "live",
    live_enabled: true,
    backfill_mode: null,
    start_id: null,
    end_id: null,
    cursor: null,
    total: null,
    backfill_status: "not_applicable",
    pacing_batch_size: 5,
  });
  await DB.prepare("UPDATE tasks SET filter_extensions = 'mp4' WHERE id = ?")
    .bind("task-1")
    .run();

  const copied = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const method = new URL(url).pathname.split("/").at(-1);
    if (method === "getUpdates") {
      const messages = [
        { document: { file_name: "clip.MP4" } },
        { document: { file_name: "notes.pdf" } },
        { photo: [{ file_id: "photo", width: 100, height: 100 }] },
        { text: "An ordinary message" },
      ];
      return Response.json({
        ok: true,
        result: messages.map((message, index) => ({
          update_id: index + 1,
          channel_post: {
            message_id: index + 101,
            chat: { id: -100111 },
            ...message,
          },
        })),
      });
    }
    assert.equal(method, "copyMessage");
    copied.push(JSON.parse(options.body).message_id);
    return Response.json({ ok: true, result: { message_id: 999 } });
  });

  await runTick({ DB });
  assert.deepEqual(copied, [101, 102, 103, 104]);
  const task = await queries.getTask(DB, "task-1");
  assert.equal(task.live_processed, 4);
  assert.equal(task.live_skipped, 0);
  assert.equal(Object.hasOwn(task, "filter_extensions"), false);
  assert.equal(
    (await queries.getBotWithSecrets(DB, "bot-1")).last_update_id,
    4,
  );
  assert.equal(
    await DB.prepare("SELECT filter_extensions FROM tasks WHERE id = ?")
      .bind("task-1")
      .first("filter_extensions"),
    "mp4",
    "legacy data remains intact but inactive",
  );

  const response = await savedTasks.handleCreateSavedTask(
    new Request("https://worker.test/api/saved-tasks", {
      method: "POST",
      body: JSON.stringify({ task_id: "task-1" }),
    }),
    { DB },
  );
  assert.equal(response.status, 201);
  const savedId = (await response.json()).data.id;
  assert.equal(
    await DB.prepare("SELECT filter_extensions FROM saved_tasks WHERE id = ?")
      .bind(savedId)
      .first("filter_extensions"),
    null,
    "new presets do not inherit legacy selections",
  );
  await DB.prepare(
    "UPDATE saved_tasks SET filter_extensions = 'pdf' WHERE id = ?",
  )
    .bind(savedId)
    .run();
  assert.equal(
    Object.hasOwn(await queries.getSavedTask(DB, savedId), "filter_extensions"),
    false,
  );
  assert.equal(
    Object.hasOwn((await queries.listSavedTasks(DB))[0], "filter_extensions"),
    false,
  );
});
