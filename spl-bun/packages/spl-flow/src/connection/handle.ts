import { makeDbHandle } from "@esproc/expression";
import type { DataSource } from "../datasource/types";

function normalizeQueryResult(result: { columns: string[]; rows: unknown[][] | Record<string, unknown>[] }) {
  const rows = result.rows.map((row) => {
    if (!Array.isArray(row)) {
      return row as Record<string, unknown>;
    }
    const record: Record<string, unknown> = {};
    result.columns.forEach((column, idx) => {
      record[column] = row[idx];
    });
    return record;
  });
  return { columns: result.columns, rows: rows as Record<string, unknown>[] };
}

export function createDataSourceHandle(dataSource: DataSource) {
  return makeDbHandle({
    name: dataSource.name,
    type: dataSource.type,
    query: async (sql: string, ...params: unknown[]) => {
      const result = await dataSource.query(sql, params.length ? params : undefined);
      return normalizeQueryResult(result);
    },
    execute: dataSource.execute
      ? async (sql: string, ...params: unknown[]) =>
          dataSource.execute!(sql, params.length ? params : undefined)
      : undefined,
    commit: async () => {
      if (dataSource.type === "sqlite") {
        await dataSource.execute?.("COMMIT", undefined);
      }
    },
    rollback: async () => {
      if (dataSource.type === "sqlite") {
        await dataSource.execute?.("ROLLBACK", undefined);
      }
    },
  });
}
