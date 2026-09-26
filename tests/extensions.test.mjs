import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { build } from "esbuild";
import { createD1 } from "./helpers/d1.mjs";

const compiled = await build({
  stdin: {
    contents: `export * from './src/shared/mediaExtensions'; export * from './src/shared/messageFilter'; export * from './src/db/bootstrap'; export * from './src/db/queries'; export * from './src/routes/api/savedTasks'; export * from './src/routes/api/tasks'; export * from './src/routes/api/validation'; export * from './src/jobs/tick';`,
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
const bot = {
  id: "extension-bot",
  token: "123456789:abcdefghijklmnopqrstuvwxyz123456789",
  bot_id: 123456789,
  bot_username: "example_bot",
  label: "Example",
  webhook_secret: "secret",
};
const task = {
  id: "extension-task",
  bot_id: bot.id,
  label: "Example",
  source_chat_id: "-100123456",
  dest_chat_id: "-100987654",
  source_chat_title: "Source",
  dest_chat_title: "Destination",
  scope: "live",
  live_enabled: true,
  backfill_mode: null,
  start_id: null,
  end_id: null,
  cursor: null,
  total: null,
  backfill_status: "not_applicable",
  pacing_batch_size: 20,
};
const request = (data, method = "POST") =>
  new Request("https://worker.test/api/task", {
    method,
    body: JSON.stringify(data),
  });
async function fixture() {
  const db = createD1();
  await api.ensureDatabaseBootstrap(db);
  await api.insertBot(db, bot);
  return db;
}
function telegramMock() {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const method = String(url).split("/").at(-1),
      params = JSON.parse(options.body);
    if (method === "getChat")
      return Response.json({
        ok: true,
        result: {
          id: Number(params.chat_id),
          type: "channel",
          title: String(params.chat_id),
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
    if (method === "getMe")
      return Response.json({
        ok: true,
        result: {
          id: bot.bot_id,
          username: bot.bot_username,
          first_name: bot.label,
          is_bot: true,
        },
      });
    throw new Error(`Unexpected Telegram method: ${method}`);
  };
  return () => {
    globalThis.fetch = previous;
  };
}

test("catalog has at least 120 distinct extensions, useful groups, and existing SVG icons", async () => {
  assert.ok(api.ALL_EXTENSIONS.length >= 120);
  assert.equal(new Set(api.ALL_EXTENSIONS).size, api.ALL_EXTENSIONS.length);
  for (const label of ["Photos", "Videos", "Audio", "Documents", "Archives"])
    assert.ok(api.EXTENSION_GROUPS.some((group) => group.label === label));
  for (const group of api.EXTENSION_GROUPS) {
    assert.ok(group.extensions.length > 0);
    await access(
      new URL(`../src/assets/icons/${group.icon}.svg`, import.meta.url),
    );
    for (const extension of group.extensions)
      assert.match(extension, /^[a-z0-9]+(?:\.[a-z0-9]+)*$/);
  }
});

test("filter normalization is case-insensitive, deduplicated, and strict", () => {
  assert.equal(
    api.normalizeExtensionFilter(" .PDF,MP4,pdf,tar.GZ "),
    "mp4,pdf,tar.gz",
  );
  assert.equal(api.normalizeExtensionFilter(""), null);
  for (const value of [
    "*",
    "pdf,,png",
    "pdf,",
    "../pdf",
    "madeupformat",
    "pdf/png",
    "a".repeat(4097),
  ])
    assert.throws(() => api.normalizeExtensionFilter(value));
  assert.throws(() => api.normalizeExtensionFilter(["pdf"]));
});

test("filenames use the final case-insensitive suffix and support compound archives", () => {
  assert.equal(api.extensionFromFilename("Holiday.MP4"), "mp4");
  assert.equal(api.extensionFromFilename("backup.2026.TAR.GZ"), "tar.gz");
  assert.equal(api.extensionFromFilename("report.pdf.exe"), "exe");
  assert.equal(api.extensionFromFilename("report.pdf.unknown"), null);
  assert.equal(api.extensionFromFilename("report.pdf\u0000.exe"), null);
  assert.equal(api.matchesExtensionFilter("tar.gz", ["gz"]), true);
  assert.equal(api.matchesExtensionFilter("tar.gz", ["tar.gz"]), true);
  assert.equal(api.matchesExtensionFilter("gz", ["tar.gz"]), false);
});

test("specific MIME fallback is used only without an existing filename", () => {
  assert.equal(
    api.detectMessageExtension({ video: { mime_type: "video/mp4" } }),
    "mp4",
  );
  assert.equal(
    api.detectMessageExtension({
      document: { mime_type: "APPLICATION/PDF; charset=binary" },
    }),
    "pdf",
  );
  assert.equal(
    api.detectMessageExtension({
      document: { file_name: "report.exe", mime_type: "application/pdf" },
    }),
    "exe",
  );
  assert.equal(
    api.detectMessageExtension({
      document: { file_name: "report.unknown", mime_type: "application/pdf" },
    }),
    null,
  );
  assert.equal(
    api.detectMessageExtension({
      document: { mime_type: "application/octet-stream" },
    }),
    null,
  );
  assert.equal(
    api.detectMessageExtension({ document: { mime_type: "image/jpeg" } }),
    null,
  );
});

test("unknown formats and ordinary Telegram photos cannot slip through an active extension filter", () => {
  for (const message of [
    {
      photo: [{ width: 100, height: 100, file_id: "photo" }],
      caption: "photo.jpg",
    },
    { text: "report.pdf" },
    { document: { file_id: "unknown" } },
  ]) {
    const evaluated = api.evaluateMessageFilter(message, {
      extensions: ["jpg", "pdf"],
    });
    assert.equal(evaluated.matched, false);
    assert.equal(evaluated.detectedExtension, null);
    assert.match(evaluated.reason, /unknown/);
    assert.equal(api.evaluateMessageFilter(message, {}).matched, true);
  }
});

test("an MP4 sent as a Telegram document matches Videos extensions while preserving other filters", () => {
  const message = {
    document: { file_id: "video", file_name: "Movie.MP4", file_size: 2048 },
  };
  const videos = api.EXTENSION_GROUPS.find(
    (group) => group.id === "videos",
  ).extensions;
  assert.equal(
    api.evaluateMessageFilter(message, { extensions: videos }).matched,
    true,
  );
  assert.equal(
    api.evaluateMessageFilter(message, {
      extensions: videos,
      maxSizeBytes: 1024,
    }).matched,
    false,
  );
  assert.equal(
    api.evaluateMessageFilter(message, { extensions: ["pdf"] }).matched,
    false,
  );
  assert.equal(
    api.evaluateMessageFilter(
      { document: { file_name: "Movie.MP4" } },
      { extensions: videos, minSizeBytes: 1000 },
    ).matched,
    true,
  );
});

test("schema upgrade adds extension columns and preserves older task settings", async () => {
  const db = await fixture();
  await api.insertTask(db, task);
  db.database.exec(
    "ALTER TABLE tasks DROP COLUMN filter_extensions; ALTER TABLE saved_tasks DROP COLUMN filter_extensions;",
  );
  const newIsolateBinding = {
    prepare: db.prepare.bind(db),
    batch: db.batch.bind(db),
  };
  await api.ensureDatabaseBootstrap(newIsolateBinding);
  const upgraded = await api.getTask(db, task.id);
  assert.equal(upgraded.label, task.label);
  assert.equal(upgraded.filter_extensions, null);
  assert.ok(
    (await db.prepare("PRAGMA table_info(saved_tasks)").all()).results.some(
      (row) => row.name === "filter_extensions",
    ),
  );
  db.close();
});

test("create, edit, snapshot and restart preserve normalized extension selections", async () => {
  const db = await fixture(),
    restore = telegramMock();
  try {
    const response = await api.handleCreateTask(
      request({
        sourceChatId: task.source_chat_id,
        destChatId: task.dest_chat_id,
        scope: "live",
        filterExtensions: ".MP4,PDF",
        saveTemplate: true,
      }),
      { DB: db },
      bot.id,
      "https://worker.test",
    );
    assert.equal(response.status, 201);
    const created = (await response.json()).data;
    assert.equal(created.filter_extensions, "mp4,pdf");
    const autoSaved = await api.listSavedTasks(db);
    assert.equal(autoSaved[0].filter_extensions, "mp4,pdf");
    const editedResponse = await api.handlePatchTask(
      request({ filterExtensions: ".tar.GZ,ZIP" }, "PATCH"),
      { DB: db },
      created.id,
    );
    assert.equal(editedResponse.status, 200);
    assert.equal(
      (await editedResponse.json()).data.filter_extensions,
      "tar.gz,zip",
    );
    const savedResponse = await api.handleCreateSavedTask(
      request({ task_id: created.id }),
      { DB: db },
    );
    const savedId = (await savedResponse.json()).data.id;
    const snapshot = (
      await (await api.handleGetSavedTask({ DB: db }, savedId)).json()
    ).data;
    assert.equal(snapshot.filter_extensions, "tar.gz,zip");
    assert.equal(snapshot.bot_token, undefined);
    const restartedResponse = await api.handleCreateTask(
      request({
        savedTaskId: savedId,
        sourceChatId: task.source_chat_id,
        destChatId: task.dest_chat_id,
        scope: "live",
        filterExtensions: snapshot.filter_extensions,
        allowDuplicate: true,
      }),
      { DB: db },
      "new",
      "https://worker.test",
    );
    assert.equal(restartedResponse.status, 201);
    assert.equal(
      (await restartedResponse.json()).data.filter_extensions,
      "tar.gz,zip",
    );
    const cleared = await api.handlePatchTask(
      request({ filterExtensions: null }, "PATCH"),
      { DB: db },
      created.id,
    );
    assert.equal((await cleared.json()).data.filter_extensions, null);
  } finally {
    restore();
    db.close();
  }
});

test("unsupported extensions and history-only filters are rejected instead of silently ignored", async () => {
  const db = await fixture();
  await api.insertTask(db, task);
  for (const filterExtensions of ["fakeformat", "*", ["pdf"]]) {
    const response = await api.handlePatchTask(
      request({ filterExtensions }, "PATCH"),
      { DB: db },
      task.id,
    );
    assert.equal(response.status, 400);
  }
  const response = await api.handleCreateTask(
    request({
      sourceChatId: task.source_chat_id,
      destChatId: task.dest_chat_id,
      scope: "backfill_only",
      startId: 1,
      endId: 10,
      filterExtensions: "pdf",
    }),
    { DB: db },
    bot.id,
    "https://worker.test",
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).description, /new messages/);
  db.close();
});

test("live polling applies extension choices before enqueueing and records skipped files", async () => {
  const db = await fixture();
  await api.insertTask(db, { ...task, filter_extensions: "mp4" });
  const previous = globalThis.fetch;
  const copied = [];
  globalThis.fetch = async (url, options) => {
    const method = String(url).split("/").at(-1),
      params = JSON.parse(options.body);
    if (method === "getUpdates")
      return Response.json({
        ok: true,
        result: [
          {
            update_id: 1,
            channel_post: {
              message_id: 101,
              chat: { id: Number(task.source_chat_id) },
              document: { file_name: "clip.MP4" },
            },
          },
          {
            update_id: 2,
            channel_post: {
              message_id: 102,
              chat: { id: Number(task.source_chat_id) },
              document: { file_name: "notes.pdf" },
            },
          },
          {
            update_id: 3,
            channel_post: {
              message_id: 103,
              chat: { id: Number(task.source_chat_id) },
              photo: [{ file_id: "photo", width: 100, height: 100 }],
            },
          },
        ],
      });
    if (method === "copyMessage") {
      copied.push(params.message_id);
      return Response.json({ ok: true, result: { message_id: 999 } });
    }
    throw new Error(`Unexpected Telegram method: ${method}`);
  };
  try {
    await api.runTick({ DB: db });
    assert.deepEqual(copied, [101]);
    const current = await api.getTask(db, task.id);
    assert.equal(current.live_processed, 1);
    assert.equal(current.live_skipped, 2);
    assert.equal((await api.getBotWithSecrets(db, bot.id)).last_update_id, 3);
  } finally {
    globalThis.fetch = previous;
    db.close();
  }
});

test("malformed MIME values cannot resolve inherited properties or crash filtering", () => {
  for (const mimeType of ["constructor", "__proto__", "toString"]) {
    assert.equal(api.extensionFromMimeType(mimeType), null);
    const message = { document: { mime_type: mimeType } };
    assert.equal(api.detectMessageExtension(message), null);
    const result = api.evaluateMessageFilter(message, { extensions: ["pdf"] });
    assert.equal(result.matched, false);
    assert.equal(result.detectedExtension, null);
  }
});
