import { readFileSync } from "fs";
import { Database } from "bun:sqlite";
import type { CsvConfig, DataSource, QueryResult } from "./types";

export class CsvDataSource implements DataSource {
  readonly type = "csv" as const;
  readonly name: string;
  private readonly config: CsvConfig;
  private data: QueryResult | null = null;

  constructor(config: CsvConfig) {
    this.name = config.name;
    this.config = config;
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const data = this.loadData();
    const tempDb = new Database(":memory:");
    const columnDefs = data.columns.map((col) => `"${col}" TEXT`).join(", ");
    tempDb.run(`CREATE TABLE csv_data (${columnDefs})`);
    const placeholders = data.columns.map(() => "?").join(", ");
    const insertStmt = tempDb.prepare(`INSERT INTO csv_data VALUES (${placeholders})`);
    for (const row of data.rows) {
      insertStmt.run(...row);
    }
    const stmt = tempDb.query(sql);
    const rows = params ? stmt.all(...params) : stmt.all();
    const columns = rows.length > 0
      ? Object.keys(rows[0] as Record<string, unknown>)
      : stmt.columns().map((col) => col.name);
    const rowArrays = rows.map((row) => columns.map((col) => (row as Record<string, unknown>)[col]));
    tempDb.close();
    return { columns, rows: rowArrays };
  }

  async close(): Promise<void> {
    this.data = null;
  }

  private loadData(): QueryResult {
    if (this.data) return this.data;
    const content = readFileSync(this.config.path, this.config.encoding || "utf-8");
    const delimiter = this.config.delimiter || ",";
    const hasHeader = this.config.hasHeader !== false;
    const lines = content.split("\n").filter((line) => line.trim());
    if (lines.length === 0) {
      this.data = { columns: [], rows: [] };
      return this.data;
    }
    const parseLine = (line: string): string[] => line.split(delimiter).map((cell) => cell.trim());
    let columns: string[];
    let dataLines: string[];
    if (hasHeader) {
      columns = parseLine(lines[0]);
      dataLines = lines.slice(1);
    } else {
      const firstRow = parseLine(lines[0]);
      columns = firstRow.map((_, idx) => `col${idx + 1}`);
      dataLines = lines;
    }
    const rows = dataLines.map((line) => parseLine(line));
    this.data = { columns, rows };
    return this.data;
  }
}
