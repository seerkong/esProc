import { Database } from "bun:sqlite";
import type { DataSource, QueryResult, SqliteConfig } from "./types";

export class SqliteDataSource implements DataSource {
  readonly type = "sqlite" as const;
  readonly name: string;
  private readonly db: Database;

  constructor(config: SqliteConfig) {
    this.name = config.name;
    this.db = new Database(config.path);
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const stmt = this.db.query(sql);
    const rows = params ? stmt.all(...params) : stmt.all();
    const columns = rows.length > 0
      ? Object.keys(rows[0] as Record<string, unknown>)
      : stmt.columns().map((col) => col.name);
    const rowArrays = rows.map((row) => columns.map((col) => (row as Record<string, unknown>)[col]));
    return { columns, rows: rowArrays };
  }

  async execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const stmt = this.db.query(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    const changes = typeof result.changes === "number" ? result.changes : 0;
    return { changes };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
