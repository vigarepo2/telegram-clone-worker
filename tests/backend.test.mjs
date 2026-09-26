import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { createD1 } from "./helpers/d1.mjs";

const compiled = await build({
  stdin: {
    contents: `export * from './src/db/bootstrap'; export * from './src/db/queries'; export * from './src/routes/api/savedTasks'; export * from './src/routes/api/tasks'; export * from './src/routes/api/validation'; export * from './src/telegram/client'; export * from './src/telegram/errors'; export * from './src/shared/messageFilter';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
const token = "123456789:abcdefghijklmnopqrstuvwxyz123456789";
const bot = {
  id: "bot-1",
  token,
  bot_id: 123456789,
  bot_username: "example_bot",
  label: "Example",
  webhook_secret: "private",
};
const task = {
  id: "task-1",
  bot_id: bot.id,
  label: "Example task",
  source_chat_id: "-100123456",
  dest_chat_id: "-100987654",
  source_chat_title: "Source",
  dest_chat_title: "Destination",
  scope: "live_and_backfill",
  live_enabled: true,
  backfill_mode: "range",
  start_id: 1,
  end_id: 20,
  cursor: 1,
  total: 20,
  backfill_status: "running",
  pacing_batch_size: 20,
};
async function fixture() {
  const db = createD1();
  await api.ensureDatabaseBootstrap(db);
  await api.insertBot(db, bot);
  await api.insertTask(db, task);
  return db;
}

test("fresh D1 bootstrap is single-flight and safe to repeat", async () => {
  const db = createD1();
  await Promise.all([
    api.ensureDatabaseBootstrap(db),
    api.ensureDatabaseBootstrap(db),
    api.ensureDatabaseBootstrap(db),
  ]);
  await api.insertBot(db, bot);
  await api.ensureDatabaseBootstrap(db);
  assert.equal((await api.listBotsSummary(db)).length, 1);
  assert.ok(
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'idx_pending_message_unique'",
      )
      .first(),
  );
  db.close();
});

test("bootstrap upgrades original schema without deleting existing tasks or activity", async () => {
  const db = createD1();
  db.database.exec(
    await readFile(
      new URL("../migrations/0001_init.sql", import.meta.url),
      "utf8",
    ),
  );
  db.database
    .prepare(
      "INSERT INTO bots(id,token,bot_id,bot_username,label,webhook_secret) VALUES(?,?,?,?,?,?)",
    )
    .run(bot.id, token, bot.bot_id, bot.bot_username, bot.label, "secret");
  db.database
    .prepare(
      "INSERT INTO tasks(id,bot_id,label,source_chat_id,dest_chat_id,method,scope) VALUES(?,?,?,?,?,'copy','live')",
    )
    .run("old-task", bot.id, "Preserve me", "-1001", "-1002");
  db.database
    .prepare(
      "INSERT INTO task_activity_log(task_id,kind,ok,detail) VALUES('old-task','live_forward',1,'Preserve history')",
    )
    .run();
  await api.ensureDatabaseBootstrap(db);
  assert.equal((await api.getTask(db, "old-task")).label, "Preserve me");
  assert.equal(
    (await api.listActivityLog(db, "old-task"))[0].detail,
    "Preserve history",
  );
  await api.insertTask(db, task);
  assert.equal((await api.getTask(db, task.id)).live_processed, 0);
  assert.equal(
    (await db.prepare("PRAGMA table_info(bots)").all()).results.some(
      (row) => row.name === "polling_lease_token",
    ),
    true,
  );
  db.close();
});

test("bootstrap failure is explicit and retryable", async () => {
  const db = createD1();
  db.unavailable = true;
  await assert.rejects(
    api.ensureDatabaseBootstrap(db),
    /Database initialization failed/,
  );
  db.unavailable = false;
  await api.ensureDatabaseBootstrap(db);
  assert.ok(
    await db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'tasks'")
      .first(),
  );
  db.close();
});

test("saved preset response never includes a token or token fragment", async () => {
  const db = await fixture();
  const created = await api.handleCreateSavedTask(
    new Request("https://worker.test/api/saved-tasks", {
      method: "POST",
      body: JSON.stringify({ task_id: task.id }),
    }),
    { DB: db },
  );
  const { data } = await created.json();
  const text = await (await api.handleGetSavedTask({ DB: db }, data.id)).text();
  assert.equal(text.includes(token), false);
  assert.equal(text.includes("bot_token"), false);
  assert.equal(JSON.parse(text).data.existing_bot_id, bot.id);
  assert.equal(
    (await (await api.handleListSavedTasks({ DB: db })).json()).data.length,
    1,
  );
  db.close();
});

test("invalid task creation does not save a bot or call Telegram", async () => {
  const db = createD1();
  await api.ensureDatabaseBootstrap(db);
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("Unexpected request");
  };
  try {
    const response = await api.handleCreateTask(
      new Request("https://worker.test/api/bots/new/tasks", {
        method: "POST",
        body: JSON.stringify({
          botToken: token,
          sourceChatId: "-1001",
          destChatId: "-1001",
          scope: "live",
        }),
      }),
      { DB: db },
      "new",
      "https://worker.test",
    );
    assert.equal(response.status, 400);
    assert.equal(called, false);
    assert.equal((await api.listBotsSummary(db)).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("task test copy rejects a mismatched bot association before network requests", async () => {
  const db = await fixture();
  await api.insertBot(db, {
    ...bot,
    id: "bot-2",
    bot_id: 987654321,
    token: "987654321:abcdefghijklmnopqrstuvwxyz123456789",
  });
  const response = await api.handleTestCopy({ DB: db }, "bot-2", task.id, 1);
  assert.equal(response.status, 404);
  db.close();
});

test("validation rejects invalid counts, filters and inverted ranges", () => {
  const base = {
    sourceChatId: "-1001",
    destChatId: "-1002",
    scope: "backfill_only",
    backfillMode: "range",
    startId: 1,
    endId: 20,
  };
  assert.equal(api.validateTaskInput(base), null);
  for (const patch of [
    { startId: 0 },
    { startId: 2.1 },
    { endId: 0 },
    { pacingBatchSize: 101 },
    { filterMediaTypes: "executable" },
    { filterMinSizeBytes: 100, filterMaxSizeBytes: 10 },
    { scope: "unknown" },
  ])
    assert.ok(api.validateTaskInput({ ...base, ...patch }));
});

test("animation metadata takes precedence over Telegram document fallback", () => {
  const message = {
    animation: { file_id: "gif", file_size: 1000 },
    document: { file_id: "gif", file_size: 1000 },
  };
  assert.equal(api.extractMessageMetadata(message).type, "animation");
  assert.equal(
    api.evaluateMessageFilter(message, { mediaTypes: ["animation"] }).matched,
    true,
  );
});

test("network errors cannot leak token-bearing Telegram URLs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    throw new Error(`Fetch failed: ${url}`);
  };
  try {
    const result = await api.toResult(() =>
      new api.TelegramClient(token).getMe(),
    );
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(token), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTML upstream errors become readable JSON errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<html>error</html>", { status: 502 });
  try {
    const result = await api.toResult(() =>
      new api.TelegramClient(token).getMe(),
    );
    assert.equal(result.ok, false);
    assert.match(result.description, /unreadable response/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pausing live copying retains queued messages for resume", async () => {
  const db = await fixture();
  await api.insertPendingMessage(db, task.id, 50);
  await api.updateTaskConfig(db, task.id, {
    live_enabled: false,
    backfill_status: "paused",
  });
  assert.equal(await api.countPendingMessages(db, task.id), 1);
  await api.updateTaskConfig(db, task.id, {
    live_enabled: true,
    backfill_status: "running",
  });
  assert.equal(await api.countPendingMessages(db, task.id), 1);
  db.close();
});

test("a shorter later rate-limit response never shortens an existing cooldown", async () => {
  const db = await fixture();
  await api.pauseBotForRateLimit(db, bot.id, 2000000500);
  await api.pauseBotForRateLimit(db, bot.id, 2000000100);
  assert.equal((await api.getTask(db, task.id)).rate_limited_until, 2000000500);
  db.close();
});

test("task creation resolves public usernames to stable numeric chat IDs", async () => {
  const db = await fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const method = String(url).split("/").at(-1);
    const params = JSON.parse(options.body);
    if (method === "getChat")
      return Response.json({
        ok: true,
        result: {
          id: params.chat_id === "@source" ? -100333333 : -100444444,
          type: "channel",
          title: params.chat_id,
        },
      });
    if (method === "getChatMember")
      return Response.json({
        ok: true,
        result: {
          status: "administrator",
          can_post_messages: true,
          user: { id: bot.bot_id },
        },
      });
    if (method === "getWebhookInfo")
      return Response.json({
        ok: true,
        result: { url: "", pending_update_count: 0 },
      });
    throw new Error("Unexpected Telegram method");
  };
  try {
    const response = await api.handleCreateTask(
      new Request("https://worker.test/api/bots/bot-1/tasks", {
        method: "POST",
        body: JSON.stringify({
          sourceChatId: "@source",
          destChatId: "@destination",
          scope: "live",
        }),
      }),
      { DB: db },
      bot.id,
      "https://worker.test",
    );
    assert.equal(response.status, 201);
    const created = (await response.json()).data;
    assert.equal(created.source_chat_id, "-100333333");
    assert.equal(created.dest_chat_id, "-100444444");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
