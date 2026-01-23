import { readFileSync } from "fs";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { DataSource, JsonConfig, QueryResult } from "./types";
import { coerceSqliteBindingValue, normalizeSqliteParams } from "./sqlite-bindings";

type LoadedJsonData = { columns: string[]; rows: SQLQueryBindings[][] };

export class JsonDataSource implements DataSource {
  readonly type = "json" as const;
  readonly name: string;
  private readonly config: JsonConfig;
  private data: LoadedJsonData | null = null;

  constructor(config: JsonConfig) {
    this.name = config.name;
    this.config = config;
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const data = this.loadData();
    const tempDb = new Database(":memory:");
    const columnDefs = data.columns.map((col) => `"${col}" TEXT`).join(", ");
    tempDb.run(`CREATE TABLE json_data (${columnDefs})`);
    const placeholders = data.columns.map(() => "?").join(", ");
    const insertStmt = tempDb.prepare(`INSERT INTO json_data VALUES (${placeholders})`);
    for (const row of data.rows) {
      insertStmt.run(...row);
    }
    const stmt = tempDb.query<Record<string, unknown>, SQLQueryBindings[]>(sql);
    const bindings = normalizeSqliteParams(params);
    const rows = bindings ? stmt.all(...bindings) : stmt.all();
    const columns = rows.length > 0 ? Object.keys(rows[0]) : stmt.columnNames;
    const rowArrays = rows.map((row) => columns.map((col) => (row as Record<string, unknown>)[col]));
    tempDb.close();
    return { columns, rows: rowArrays };
  }

  async close(): Promise<void> {
    this.data = null;
  }

  private loadData(): LoadedJsonData {
    if (this.data) return this.data;
    const content = readFileSync(this.config.path, this.config.encoding || "utf-8");
    const jsonData = JSON.parse(content) as unknown;
    let records: unknown[];
    if (this.config.arrayPath) {
      records = this.extractByPath(jsonData, this.config.arrayPath);
    } else if (Array.isArray(jsonData)) {
      records = jsonData;
    } else {
      records = [jsonData];
    }
    if (!Array.isArray(records) || records.length === 0) {
      this.data = { columns: [], rows: [] };
      return this.data;
    }
    const firstRecord = records[0];
    const columns = typeof firstRecord === "object" && firstRecord !== null
      ? Object.keys(firstRecord as Record<string, unknown>)
      : ["value"];
    const rows = records.map((record) => {
      if (typeof record === "object" && record !== null) {
        return columns.map((col) => {
          const value = (record as Record<string, unknown>)[col];
          if (value !== null && typeof value === "object") {
            return coerceSqliteBindingValue(JSON.stringify(value));
          }
          return coerceSqliteBindingValue(value);
        });
      }
      return [coerceSqliteBindingValue(record)];
    });
    this.data = { columns, rows };
    return this.data;
  }

  private extractByPath(data: unknown, path: string): unknown[] {
    const clean = path.replace(/^\$\./, "");
    const parts = clean.split(".");
    let current: any = data;
    for (const part of parts) {
      if (current == null) return [];
      current = current[part];
    }
    if (Array.isArray(current)) return current;
    return current == null ? [] : [current];
  }
}
