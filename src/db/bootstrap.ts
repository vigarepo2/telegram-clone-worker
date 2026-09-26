/** Additive, automatic schema upgrades. Historical SQL migrations are never replayed:
 * some of them drop task data. Failed upgrades remain retryable on the next request. */
const initializations = new WeakMap<D1Database, Promise<void>>();

export function ensureDatabaseBootstrap(db: D1Database): Promise<void> {
  const existing = initializations.get(db);
  if (existing) return existing;
  const pending = bootstrap(db).catch(() => {
    initializations.delete(db);
    throw new Error(
      "Database initialization failed. Check the D1 binding and try again.",
    );
  });
  initializations.set(db, pending);
  return pending;
}

async function bootstrap(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        bot_id INTEGER NOT NULL,
        bot_username TEXT NOT NULL,
        label TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_update_id INTEGER NOT NULL DEFAULT 0
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        source_chat_id TEXT NOT NULL,
        source_chat_title TEXT,
        dest_chat_id TEXT NOT NULL,
        dest_chat_title TEXT,
        scope TEXT NOT NULL CHECK (scope IN ('live', 'live_and_backfill', 'backfill_only')),
        live_enabled INTEGER NOT NULL DEFAULT 0,
        backfill_mode TEXT CHECK (backfill_mode IN ('range', 'lastN')),
        start_id INTEGER,
        end_id INTEGER,
        cursor INTEGER,
        total INTEGER,
        processed INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        backfill_status TEXT NOT NULL DEFAULT 'not_applicable'
          CHECK (backfill_status IN ('not_applicable', 'pending', 'running', 'paused', 'complete', 'cancelled', 'failed')),
        pacing_batch_size INTEGER NOT NULL DEFAULT 20,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        stop_reason TEXT,
        stopped_at INTEGER,
        lease_expires_at INTEGER,
        rate_limited_until INTEGER,
        live_processed INTEGER NOT NULL DEFAULT 0,
        live_failed INTEGER NOT NULL DEFAULT 0,
        filter_media_types TEXT,
        filter_extensions TEXT,
        filter_min_size_bytes INTEGER,
        filter_max_size_bytes INTEGER,
        live_skipped INTEGER NOT NULL DEFAULT 0
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('live_forward', 'backfill_batch')),
        detail TEXT,
        ok INTEGER NOT NULL,
        error TEXT,
        at INTEGER NOT NULL DEFAULT (unixepoch())
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS saved_tasks (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        bot_token TEXT NOT NULL,
        bot_label TEXT NOT NULL,
        bot_username TEXT NOT NULL,
        source_chat_id TEXT NOT NULL,
        source_chat_title TEXT,
        dest_chat_id TEXT NOT NULL,
        dest_chat_title TEXT,
        scope TEXT NOT NULL CHECK (scope IN ('live', 'live_and_backfill', 'backfill_only')),
        backfill_mode TEXT CHECK (backfill_mode IN ('range', 'lastN')),
        start_id INTEGER,
        end_id INTEGER,
        n INTEGER,
        pacing_batch_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        filter_media_types TEXT,
        filter_extensions TEXT,
        filter_min_size_bytes INTEGER,
        filter_max_size_bytes INTEGER
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_pending_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        message_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        media_type TEXT,
        file_size INTEGER,
        file_name TEXT
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        update_id INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        received_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`),
  ]);

  const additions: Record<string, Record<string, string>> = {
    bots: {
      last_update_id: "INTEGER NOT NULL DEFAULT 0",
      polling_lease_token: "TEXT",
      polling_lease_expires_at: "INTEGER",
    },
    tasks: {
      stop_reason: "TEXT",
      stopped_at: "INTEGER",
      lease_expires_at: "INTEGER",
      rate_limited_until: "INTEGER",
      live_processed: "INTEGER NOT NULL DEFAULT 0",
      live_failed: "INTEGER NOT NULL DEFAULT 0",
      filter_media_types: "TEXT",
      filter_extensions: "TEXT",
      filter_min_size_bytes: "INTEGER",
      filter_max_size_bytes: "INTEGER",
      live_skipped: "INTEGER NOT NULL DEFAULT 0",
    },
    saved_tasks: {
      filter_media_types: "TEXT",
      filter_extensions: "TEXT",
      filter_min_size_bytes: "INTEGER",
      filter_max_size_bytes: "INTEGER",
    },
    task_pending_messages: {
      media_type: "TEXT",
      file_size: "INTEGER",
      file_name: "TEXT",
    },
  };
  for (const [table, columns] of Object.entries(additions)) {
    const info = await db
      .prepare(`PRAGMA table_info(${table})`)
      .all<{ name: string }>();
    const names = new Set(info.results.map((column) => column.name));
    for (const [column, definition] of Object.entries(columns)) {
      if (names.has(column)) continue;
      try {
        await db
          .prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
          .run();
      } catch (error) {
        // A second Worker isolate may have added this column after our PRAGMA.
        const refreshed = await db
          .prepare(`PRAGMA table_info(${table})`)
          .all<{ name: string }>();
        if (!refreshed.results.some((item) => item.name === column))
          throw error;
      }
    }
  }
  await db.batch([
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tasks_bot_id ON tasks(bot_id)`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_tasks_source_chat ON tasks(bot_id, source_chat_id)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_tasks_backfill_running ON tasks(backfill_status) WHERE backfill_status = 'running'`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_task_activity_log_task_id ON task_activity_log(task_id, at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_saved_tasks_task_id ON saved_tasks(task_id)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_pending_messages_task_id ON task_pending_messages(task_id, id ASC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_updates_bot_id ON updates(bot_id, received_at DESC)`,
    ),
  ]);
  const queueIndex = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_pending_message_unique'",
    )
    .first();
  if (!queueIndex) {
    await db.batch([
      db.prepare(
        `DELETE FROM task_pending_messages WHERE id NOT IN (SELECT MIN(id) FROM task_pending_messages GROUP BY task_id, message_id)`,
      ),
      db.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_message_unique ON task_pending_messages(task_id, message_id)`,
      ),
    ]);
  }
}
