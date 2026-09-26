import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

/** SQLite-backed D1 adapter; batches commit atomically like the production binding. */
export class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.database, this.sql, values);
  }
  execute() {
    if (this.database.unavailable) throw new Error("Simulated D1 outage");
    const statement = this.database.sqlite.prepare(this.sql);
    const returnsRows = statement.columns().length > 0;
    const rows = returnsRows
      ? statement.all(...this.values).map((row) => ({ ...row }))
      : [];
    const result = returnsRows
      ? this.database.sqlite
          .prepare(
            "SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid",
          )
          .get()
      : statement.run(...this.values);
    return {
      success: true,
      results: rows,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
  async first(column) {
    const row = this.execute().results[0] ?? null;
    return column && row ? row[column] : row;
  }
  async all() {
    return this.execute();
  }
  async run() {
    return this.execute();
  }
  async raw({ columnNames = false } = {}) {
    if (this.database.unavailable) throw new Error("Simulated D1 outage");
    const statement = this.database.sqlite.prepare(this.sql);
    statement.setReturnArrays(true);
    const rows = statement.all(...this.values);
    return columnNames
      ? [statement.columns().map((column) => column.name), ...rows]
      : rows;
  }
}
export class Database {
  sqlite = new DatabaseSync(":memory:");
  database = this.sqlite;
  unavailable = false;
  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  async batch(statements) {
    if (this.unavailable) throw new Error("Simulated D1 outage");
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (cause) {
      this.sqlite.exec("ROLLBACK");
      throw cause;
    }
  }
  async exec(sql) {
    if (this.unavailable) throw new Error("Simulated D1 outage");
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  close() {
    this.sqlite.close();
  }
}
export function createD1() {
  return new Database();
}
export async function loadTypescript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    logLevel: "silent",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
