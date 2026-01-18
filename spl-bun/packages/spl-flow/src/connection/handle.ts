import { makeDbHandle } from "@esproc/expression";
import type { DataSource } from "../datasource/types";

export function createDataSourceHandle(dataSource: DataSource) {
  return makeDbHandle({
    name: dataSource.name,
    type: dataSource.type,
    query: async (sql: string, ...params: unknown[]) =>
      dataSource.query(sql, params.length ? params : undefined),
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
