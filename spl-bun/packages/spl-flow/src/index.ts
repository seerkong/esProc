import {
  compileExpression,
  defaultMemberRegistry,
  FunctionRegistryBuilder,
  makeDbHandle,
  makeFileHandle,
  type FunctionRegistry,
} from "@esproc/expression";
import { DataSet } from "@esproc/core";
import { readFileSync } from "fs";
import { extname, isAbsolute, resolve as resolvePath, sep } from "path";
import { ConnectionRegistry } from "./connection/registry";
import { createDataSourceHandle } from "./connection/handle";
import { DataSourceFactory } from "./datasource/factory";
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
  workspaceRoot?: string;
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

type QueryResultData = { columns: string[]; rows: Record<string, unknown>[] };

type DataSetLike = {
  rows: Record<string, unknown>[];
  schema?: { name: string }[];
};

type ResolvedConnectArgs =
  | { kind: "name"; name: string }
  | { kind: "sqlite"; path: string };

function getWorkspaceRoot(ctx: FlowExecutionContext): string {
  const root = typeof ctx.workspaceRoot === "string" && ctx.workspaceRoot.trim().length > 0
    ? ctx.workspaceRoot
    : process.cwd();
  return root;
}

function resolveWorkspacePath(input: string, ctx: FlowExecutionContext): string {
  if (isAbsolute(input)) return input;
  const root = getWorkspaceRoot(ctx);
  const resolved = resolvePath(root, input);
  const rootResolved = resolvePath(root);
  const rootPrefix = rootResolved.endsWith(sep) ? rootResolved : rootResolved + sep;
  if (resolved !== rootResolved && !resolved.startsWith(rootPrefix)) {
    throw new Error("Path escapes workspace root");
  }
  return resolved;
}

function parseConnectArgs(nameOrType: unknown, maybePath: unknown): ResolvedConnectArgs {
  if (typeof nameOrType !== "string" || nameOrType.trim().length === 0) {
    throw new Error("connect() expects string arguments");
  }
  const first = nameOrType.trim();
  if (maybePath === undefined) {
    return { kind: "name", name: first };
  }
  if (typeof maybePath !== "string" || maybePath.trim().length === 0) {
    throw new Error("connect(driver, url) expects string arguments");
  }
  const second = maybePath.trim();
  const type = first.toLowerCase();
  if (type !== "sqlite") {
    throw new Error("Only connect(\"sqlite\", path) is supported in spl-flow runtime");
  }
  return { kind: "sqlite", path: second };
}

function parseCsvContent(content: string, delimiter: string = ","): { rows: Record<string, unknown>[]; schema: { name: string; type?: string }[] } {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], schema: [] };
  const rawCols = lines[0].split(delimiter).map((c) => c.trim());
  const schema = rawCols.map((name) => ({ name, type: "unknown" }));
  const rows: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((c) => c.trim());
    const record: Record<string, unknown> = {};
    rawCols.forEach((col, idx) => {
      const v = cells[idx] ?? "";
      const num = Number(v);
      record[col] = v !== "" && !Number.isNaN(num) ? num : v;
    });
    rows.push(record);
  }
  return { rows, schema };
}

function makeRuntimeFunctions(ctx: FlowExecutionContext): FunctionRegistry {
  const registry = new ConnectionRegistry();
  for (const config of ctx.dataSourceConfigs ?? []) {
    registry.register(config);
  }

  const connectFn = (nameOrType?: unknown, maybePath?: unknown): unknown => {
    if (nameOrType === undefined) {
      throw new Error("connect() requires at least 1 argument");
    }
    const parsed = parseConnectArgs(nameOrType, maybePath);

    if (parsed.kind === "name") {
      const name = parsed.name;
      if (ctx.connections?.has(name)) {
        return createDbHandle(resolveConnection(name, ctx), ctx);
      }
      const ds = registry.get(name);
      if (ds) {
        return createDataSourceHandle(ds);
      }
      throw new Error(`Connection '${name}' not found`);
    }

    const resolvedPath = resolveWorkspacePath(parsed.path, ctx);
    const ds = DataSourceFactory.create({ type: "sqlite", name: "sqlite", path: resolvedPath });
    return createDataSourceHandle(ds);
  };

  const fileFn = (path?: unknown): unknown => {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new Error("file() expects a path string");
    }
    const resolved = resolveWorkspacePath(path.trim(), ctx);
    return makeFileHandle({
      path: resolved,
      read: () => readFileSync(resolved, "utf-8"),
    });
  };

  const csvFn = (content?: unknown): unknown => {
    if (typeof content !== "string") {
      throw new Error("csv() expects CSV string content");
    }
    return parseCsvContent(content);
  };

  const tFn = (path?: unknown): unknown => {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new Error("T() expects a path string");
    }
    const resolved = resolveWorkspacePath(path.trim(), ctx);
    const content = readFileSync(resolved, "utf-8");
    const ext = extname(resolved).toLowerCase();
    if (ext === ".csv") {
      return parseCsvContent(content);
    }
    if (ext === ".json") {
      const data = JSON.parse(content) as unknown;
      if (Array.isArray(data)) {
        return { rows: data as Record<string, unknown>[], schema: data.length > 0 && typeof data[0] === "object" && data[0] !== null
          ? Object.keys(data[0] as Record<string, unknown>).map((name) => ({ name, type: "unknown" }))
          : [] };
      }
      if (data && typeof data === "object") {
        const rec = data as Record<string, unknown>;
        return { rows: [rec], schema: Object.keys(rec).map((name) => ({ name, type: "unknown" })) };
      }
      return { rows: [], schema: [] };
    }
    throw new Error(`T() unsupported file type: ${ext || "(none)"}`);
  };

  return new FunctionRegistryBuilder()
    .add("connect", connectFn)
    .add("file", fileFn)
    .add("csv", csvFn)
    .add("t", tFn)
    .build();
}

function toCellRef(row: number, col: string): string {
  return `${String(col).toUpperCase()}${row}`;
}

function resolveConnection(name: string, ctx: FlowExecutionContext): DBConnection {
  const connection = ctx.connections?.get(name);
  if (connection) {
    return connection;
  }
  throw new Error(`Connection '${name}' not found`);
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
      if (dataSource && !(config.name in scope)) {
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

function resolveExpressionFunctions(ctx: FlowExecutionContext): FunctionRegistry {
  return makeRuntimeFunctions(ctx);
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
  const compiled = compileExpression(inner, resolveExpressionFunctions(ctx), defaultMemberRegistry);
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
  if (ctx.workspaceRoot === undefined) {
    ctx.workspaceRoot = process.cwd();
  }
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
      const hasConnection = Boolean(connectionName && ctx.connections?.has(connectionName));
      const hasDataSource = Boolean(connectionName && ctx.dataSourceConfigs?.some((config) => config.name === connectionName));

      if (connectionName && !scope[connectionName] && hasConnection) {
        const connection = resolveConnection(connectionName, ctx);
        scope[connectionName] = createDbHandle(connection, ctx);
      }

      if (connectionName && !scope[connectionName] && hasDataSource && ctx.dataSourceConfigs) {
        const registry = new ConnectionRegistry();
        for (const config of ctx.dataSourceConfigs) {
          registry.register(config);
        }
        const dataSource = registry.get(connectionName);
        if (dataSource) {
          scope[connectionName] = createDataSourceHandle(dataSource);
        }
      }

      if (connectionName && !scope[connectionName] && !hasConnection && !hasDataSource) {
        throw new Error(`Connection '${connectionName}' not found`);
      }

      const qValue = resolveQQuery(expression, ctx, scope);
      const registry = resolveExpressionFunctions(ctx);
      const compiled = qValue === null
        ? compileExpression(expression, registry, defaultMemberRegistry)
        : null;
      let value = qValue === null ? compiled!.evaluate(scope) : qValue;
      if (value instanceof Promise) {
        value = await value;
      }
      scope[ref] = value;

      const queryResult = toQueryResult(value);
      if (queryResult) {
        lastQuery = queryResult;
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

function isQueryResult(value: unknown): value is QueryResultData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "columns" in (value as Record<string, unknown>) &&
      "rows" in (value as Record<string, unknown>) &&
      Array.isArray((value as { columns?: unknown[] }).columns) &&
      Array.isArray((value as { rows?: unknown[] }).rows) &&
      ((value as { rows?: unknown[] }).rows ?? []).every((row) => row && typeof row === "object" && !Array.isArray(row))
  );
}

function isDataSetLike(value: unknown): value is DataSetLike {
  return Boolean(
    value &&
      typeof value === "object" &&
      "rows" in (value as Record<string, unknown>) &&
      Array.isArray((value as { rows?: unknown[] }).rows)
  );
}

function toQueryResult(value: unknown): QueryResultData | null {
  if (isQueryResult(value)) return value;
  if (value instanceof DataSet) {
    const ds = value as unknown as { schema: { name: string }[]; rows: Record<string, unknown>[] };
    return {
      columns: ds.schema.map((col: { name: string }) => col.name),
      rows: ds.rows,
    };
  }
  if (Array.isArray(value)) {
    const rows = value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
    if (rows.length === 0) return null;
    return { columns: Object.keys(rows[0]), rows };
  }
  if (isDataSetLike(value)) {
    const rows = (value.rows ?? []).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
    if (rows.length === 0) return null;
    const columns = value.schema?.length
      ? value.schema.map((col) => col.name)
      : Object.keys(rows[0]);
    return { columns, rows };
  }
  return null;
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
