import { compileExpression, defaultMemberRegistry, makeDbHandle } from "@esproc/expression";
import { ConnectionRegistry } from "./connection/registry";
import { createDataSourceHandle } from "./connection/handle";
import type { DataSourceConfig } from "./datasource/types";

export type FlowStepKind = "expr" | "query";

export interface FlowCell {
  row: number;
  col: string;
  expr: string;
}

export interface FlowResult {
  kind: FlowStepKind;
  value: unknown;
}

export interface FlowAstCell {
  type: "expression";
  id: string;
  position: {
    row: number;
    col: string;
  };
  expr: string;
}

export interface FlowAstSequence {
  type: "sequence";
  block: FlowAstCell[][];
}

export type FlowAst = FlowAstSequence;

export interface DBConnection {
  name: string;
  type: "sqlite" | "jdbc" | string;
  path?: string;
  driver?: string;
  url?: string;
}

export interface FlowExecutionContext {
  scope?: Record<string, unknown>;
  connections?: Map<string, DBConnection>;
  dataSourceConfigs?: DataSourceConfig[];
  defaultDbPath?: string;
  adapters?: {
    sqliteQuery?: (options: { connection?: DBConnection; dbPath?: string; sql: string; params?: unknown[] }) => unknown | Promise<unknown>;
    sqliteExecute?: (options: { connection?: DBConnection; dbPath?: string; sql: string; params?: unknown[] }) => unknown | Promise<unknown>;
    connect?: (name: string) => DBConnection | Promise<DBConnection>;
  };
}

export interface FlowCellEvaluation {
  row: number;
  col: string;
  expr: string;
  status: "ok" | "error";
  result?: unknown;
  error?: string;
}

export interface FlowEvaluationResult {
  cells: FlowCellEvaluation[];
  lastQuery?: unknown;
  scope: Record<string, unknown>;
}

function toCellRef(row: number, col: string): string {
  return `${String(col).toUpperCase()}${row}`;
}

function resolveConnection(name: string, ctx: FlowExecutionContext): DBConnection {
  const connection = ctx.connections?.get(name);
  if (!connection) {
    throw new Error(`Connection '${name}' not found`);
  }
  return connection;
}

function inferConnectionName(expression: string): string | null {
  const match = expression.match(/^\s*([a-zA-Z_][\w]*)\s*\./);
  return match ? match[1] : null;
}

function ensureDbHandles(scope: Record<string, unknown>, ctx: FlowExecutionContext) {
  if (ctx.dataSourceConfigs) {
    const registry = new ConnectionRegistry();
    for (const config of ctx.dataSourceConfigs) {
      registry.register(config);
      const dataSource = registry.get(config.name);
      if (dataSource) {
        scope[config.name] = createDataSourceHandle(dataSource);
      }
    }
  }
  if (!ctx.connections) return;
  for (const [name, connection] of ctx.connections.entries()) {
    if (!(name in scope)) {
      scope[name] = createDbHandle(connection, ctx);
    }
  }
}

function createDbHandle(connection: DBConnection, ctx: FlowExecutionContext) {
  return makeDbHandle({
    name: connection.name,
    type: connection.type,
    query: (sql: string, ...params: unknown[]) => {
      const adapter = ctx.adapters?.sqliteQuery;
      if (!adapter) {
        throw new Error("No sqliteQuery adapter provided for query()");
      }
      return adapter({
        connection,
        dbPath: ctx.defaultDbPath,
        sql,
        params: params.length ? params : undefined,
      });
    },
    execute: (sql: string, ...params: unknown[]) => {
      const adapter = ctx.adapters?.sqliteExecute ?? ctx.adapters?.sqliteQuery;
      if (!adapter) {
        throw new Error("No sqliteExecute adapter provided for execute()");
      }
      return adapter({
        connection,
        dbPath: ctx.defaultDbPath,
        sql,
        params: params.length ? params : undefined,
      });
    },
    commit: () => {
      if (!ctx.adapters?.sqliteExecute) {
        throw new Error("No sqliteExecute adapter provided for commit()");
      }
      return ctx.adapters.sqliteExecute({
        connection,
        dbPath: ctx.defaultDbPath,
        sql: "commit",
      });
    },
    rollback: () => {
      if (!ctx.adapters?.sqliteExecute) {
        throw new Error("No sqliteExecute adapter provided for rollback()");
      }
      return ctx.adapters.sqliteExecute({
        connection,
        dbPath: ctx.defaultDbPath,
        sql: "rollback",
      });
    },
  });
}

function resolveQQuery(expression: string, ctx: FlowExecutionContext, scope: Record<string, unknown>) {
  if (!expression.trim().startsWith("$q(")) return null;
  const adapter = ctx.adapters?.sqliteQuery;
  if (!adapter) {
    throw new Error("No sqliteQuery adapter provided for $q() execution");
  }
  const match = expression.match(/^\s*\$q\((.*)\)\s*$/s);
  if (!match) return null;
  const inner = match[1];
  const compiled = compileExpression(inner, undefined, defaultMemberRegistry);
  const argValue = compiled.evaluate(scope);
  const sql = typeof argValue === "string" ? argValue : null;
  if (!sql) {
    throw new Error("$q() requires SQL string argument");
  }
  return adapter({
    dbPath: ctx.defaultDbPath,
    sql,
  });
}

export function buildFlowAst(cells: FlowCell[]): FlowAst {
  const normalized = cells.map((cell) => {
    const col = String(cell.col).toUpperCase();
    const row = Number(cell.row);
    const id = `${col}${row}`;
    return {
      type: "expression",
      id,
      position: { row, col },
      expr: cell.expr,
    } as FlowAstCell;
  });
  const ordered = [...normalized].sort((a, b) => {
    if (a.position.row !== b.position.row) return a.position.row - b.position.row;
    return a.position.col.localeCompare(b.position.col);
  });
  return {
    type: "sequence",
    block: [ordered],
  };
}

export async function evaluateFlow(
  cells: FlowCell[],
  ctx: FlowExecutionContext,
): Promise<FlowEvaluationResult> {
  const scope: Record<string, unknown> = { ...(ctx.scope ?? {}) };
  const evaluations: FlowCellEvaluation[] = [];
  let lastQuery: unknown;

  const ast = buildFlowAst(cells);
  ensureDbHandles(scope, ctx);

  for (const cell of ast.block.flat()) {
    const expression = cell.expr ?? "";
    const ref = cell.id;
    const row = cell.position.row;
    const col = cell.position.col;

    if (!expression.trim()) {
      evaluations.push({
        row,
        col,
        expr: "",
        status: "error",
        error: "Empty expression",
      });
      continue;
    }

    try {
      const connectionName = inferConnectionName(expression);
      if (connectionName && ctx.connections && !scope[connectionName]) {
        const connection = resolveConnection(connectionName, ctx);
        scope[connectionName] = createDbHandle(connection, ctx);
      }

      const qValue = resolveQQuery(expression, ctx, scope);
      const compiled = qValue === null
        ? compileExpression(expression, undefined, defaultMemberRegistry)
        : null;
        let value = qValue === null ? compiled!.evaluate(scope) : qValue;
        if (value instanceof Promise) {
          value = await value;
        }
        scope[ref] = value;

        if (value && typeof value === "object" && "columns" in value && "rows" in value) {
          lastQuery = value;
        }

        evaluations.push({
          row,
          col,
          expr: expression,
          status: "ok",
          result: value,
        });
      } catch (error) {

      const message = error instanceof Error ? error.message : String(error);
      evaluations.push({
        row,
        col,
        expr: expression,
        status: "error",
        error: message,
      });
    }
  }

  return { cells: evaluations, lastQuery, scope };
}

export function buildFlowScope(ctx: FlowExecutionContext): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  if (ctx.dataSourceConfigs) {
    const registry = new ConnectionRegistry();
    for (const config of ctx.dataSourceConfigs) {
      registry.register(config);
      const dataSource = registry.get(config.name);
      if (dataSource) {
        scope[config.name] = createDataSourceHandle(dataSource);
      }
    }
  }
  if (ctx.connections) {
    for (const [name, connection] of ctx.connections.entries()) {
      scope[name] = createDbHandle(connection, ctx);
    }
  }
  return scope;
}

export type { DataSourceConfig, SqliteConfig, CsvConfig, JsonConfig } from "./datasource/types";
export { ConnectionRegistry } from "./connection/registry";
export { createDataSourceHandle } from "./connection/handle";
