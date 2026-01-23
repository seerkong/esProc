import {
  compileExpression,
  defaultMemberRegistry,
  FunctionRegistryBuilder,
  makeDbHandle,
  makeFileHandle,
  truthy,
  type FunctionRegistry,
} from "@esproc/expression";
import { DataSet } from "@esproc/core";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, extname, isAbsolute, resolve as resolvePath, sep } from "path";
import * as XLSX from "xlsx";
import { ConnectionRegistry } from "./connection/registry";
import { createDataSourceHandle } from "./connection/handle";
import { DataSourceFactory } from "./datasource/factory";
import type { DataSourceConfig } from "./datasource/types";
import { buildFlowGrid } from "./flow/grid";
import { getCodeBlockEndRow, setNext, type FlowLocation, type FlowStackFrame } from "./flow/navigation";

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
  const root = getWorkspaceRoot(ctx);
  const rootResolved = resolvePath(root);
  const resolved = isAbsolute(input) ? resolvePath(input) : resolvePath(rootResolved, input);
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

  type ExcelIoOptions = { sheet?: string | number; header?: boolean };

  type CallArgGroupsValue = unknown[][];

  function isCallArgGroupsValue(value: unknown): value is CallArgGroupsValue {
    return Array.isArray(value) && value.every((v) => Array.isArray(v));
  }

  function isExcelOptionsObject(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return "sheet" in obj || "header" in obj;
  }

  function parseExcelSheet(value: unknown): string | number | undefined {
    if (typeof value === "string") return value;
    if (typeof value === "number") return value;
    if (value === undefined) return undefined;
    throw new Error("T() sheet must be a string (name) or number (1-based index)");
  }

  function readExcelTable(filePath: string, options: ExcelIoOptions): DataSetLike {
    const buf = readFileSync(filePath);
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

    const sheetName = (() => {
      const requested = options.sheet;
      if (requested === undefined) return wb.SheetNames[0];
      if (typeof requested === "number") {
        const idx = Math.trunc(requested) - 1;
        if (idx < 0 || idx >= wb.SheetNames.length) {
          throw new Error(`T() invalid sheet index: ${requested}`);
        }
        return wb.SheetNames[idx];
      }
      if (typeof requested === "string") {
        if (!wb.SheetNames.includes(requested)) {
          throw new Error(`T() sheet not found: ${requested}`);
        }
        return requested;
      }
      return wb.SheetNames[0];
    })();

    if (!sheetName) return { rows: [], schema: [] };
    const ws = wb.Sheets[sheetName];
    if (!ws) return { rows: [], schema: [] };

    const header = options.header !== false;
    if (header) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, blankrows: false });
      const schema = rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({ name, type: "unknown" }))
        : [];
      return { rows, schema };
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false }) as unknown[][];
    const width = matrix.reduce((acc, row) => Math.max(acc, Array.isArray(row) ? row.length : 0), 0);
    const keys = Array.from({ length: width }, (_, i) => `#${i + 1}`);

    const rows = matrix
      .filter((row) => Array.isArray(row) && row.some((v) => v !== null && v !== undefined && v !== ""))
      .map((row) => {
        const record: Record<string, unknown> = {};
        keys.forEach((key, idx) => {
          record[key] = (row as unknown[])[idx] ?? null;
        });
        return record;
      });

    return { rows, schema: keys.map((name) => ({ name, type: "unknown" })) };
  }

  function extractExportTable(data: unknown): { rows: Record<string, unknown>[]; columns: string[] } {
    const asRecordRows = (rows: unknown[]): Record<string, unknown>[] =>
      rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));

    if (Array.isArray(data)) {
      const rows = asRecordRows(data);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { rows, columns };
    }

    if (isDataSetLike(data)) {
      const rows = asRecordRows(data.rows ?? []);
      const schemaColumns = Array.isArray(data.schema) ? data.schema.map((col) => col.name) : [];
      const resultColumns = schemaColumns.length > 0 ? schemaColumns : (rows.length > 0 ? Object.keys(rows[0]) : []);
      return { rows, columns: resultColumns };
    }

    throw new Error("T() Excel export expects array-of-records or { rows: [...] }");
  }

  function writeExcelFile(filePath: string, data: unknown, options: ExcelIoOptions): void {
    const { rows, columns } = extractExportTable(data);
    const header = options.header !== false;

    const jsonOpts: Record<string, unknown> = { skipHeader: !header };
    if (columns.length > 0) {
      jsonOpts.header = columns;
    }

    const ws = XLSX.utils.json_to_sheet(rows, jsonOpts as never);
    const wb = XLSX.utils.book_new();

    const rawSheet = options.sheet;
    const sheetName = typeof rawSheet === "string" && rawSheet.trim().length > 0
      ? rawSheet
      : typeof rawSheet === "number" && Number.isFinite(rawSheet)
        ? `Sheet${Math.trunc(rawSheet)}`
        : "Sheet1";

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    mkdirSync(dirname(filePath), { recursive: true });

    const ext = extname(filePath).toLowerCase();
    const bookType = ext === ".xls" ? "biff8" : "xlsx";
    const out = XLSX.write(wb, { bookType: bookType as never, type: "buffer" }) as unknown as Uint8Array;
    writeFileSync(filePath, out);
  }

  const tFn = (...rawArgs: unknown[]): unknown => {
    const args = [...rawArgs];
    const path = args.shift();
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new Error("T() expects a path string");
    }
    const sourcePath = path.trim();
    const resolved = resolveWorkspacePath(sourcePath, ctx);
    const ext = extname(resolved).toLowerCase();

    // Expression evaluator appends:
    // - argGroups (evaluated, nested arrays) when semicolon groups exist
    // - option string when @ options exist
    let option: string | undefined;
    if (args.length >= 1) {
      const last = args[args.length - 1];
      const prev = args.length >= 2 ? args[args.length - 2] : undefined;
      const looksLikeOption = (value: unknown) =>
        typeof value === "string" && value.length > 0 && /^[a-z0-9]+$/.test(value);

      // When semicolon groups are present, the option (if any) must follow the argGroups value.
      if (looksLikeOption(last) && isCallArgGroupsValue(prev)) {
        option = last as string;
        args.pop();
      } else if (looksLikeOption(last)) {
        // Without semicolon groups, treat the last string as an option only for the supported
        // Excel subset (avoids mis-reading sheet names as options).
        const candidate = last as string;
        if (/^[bc]+$/.test(candidate)) {
          option = candidate;
          args.pop();
        }
      }
    }

    let argGroups: CallArgGroupsValue | undefined;
    if (args.length >= 1 && isCallArgGroupsValue(args[args.length - 1])) {
      argGroups = args.pop() as CallArgGroupsValue;
    }

    // Support a small parity subset for Excel T():
    // - @b: no header/title row (default: has header)
    // - @c: cursor mode is NOT implemented yet (xlsx-only in Java)
    if (option) {
      if (option.includes("c")) {
        throw new Error("T@c cursor mode is not supported yet (xlsx-only in Java SPL)");
      }
      const unsupported = option.replace(/[bc]/g, "");
      if (unsupported.length > 0) {
        throw new Error(`T() unsupported option(s): ${unsupported}`);
      }
    }

    if (ext === ".xls" || ext === ".xlsx") {
      const header = !(option && option.includes("b"));

      let sheet: string | number | undefined;
      let data: unknown;

      if (argGroups) {
        const g1 = argGroups[0] ?? [];
        const g2 = argGroups[1] ?? [];

        if (argGroups.length > 2) {
          throw new Error("T() too many ';' groups for Excel");
        }
        if (g2.length > 1) {
          throw new Error("T() Excel sheet group must have at most 1 argument");
        }

        data = g1.length >= 2 ? g1[1] : undefined;
        sheet = parseExcelSheet(g2[0]);
      } else {
        data = args[0];

        // Excel sheet selection must use semicolon syntax: `T(path; sheet)` or `T(path, data; sheet)`.
        if (typeof data === "string" || typeof data === "number") {
          throw new Error("T() Excel sheet selection requires ';' groups: use T(path; sheet) or T(path, data; sheet)");
        }
      }

      // BREAKING: remove the TS-only options-object forms.
      if (isExcelOptionsObject(data) || isExcelOptionsObject(args[1])) {
        throw new Error(
          "T() Excel options-object form is no longer supported; use semicolon groups for sheet and @b for no-header",
        );
      }

      const excelOptions: ExcelIoOptions = { sheet, header };
      if (data === undefined) {
        return readExcelTable(resolved, excelOptions);
      }
      writeExcelFile(resolved, data, excelOptions);
      return sourcePath;
    }

    const content = readFileSync(resolved, "utf-8");
    if (ext === ".csv") {
      if (args[0] !== undefined) throw new Error("T() CSV does not support export");
      return parseCsvContent(content);
    }
    if (ext === ".json") {
      if (args[0] !== undefined) throw new Error("T() JSON does not support export");
      const data = JSON.parse(content) as unknown;
      if (Array.isArray(data)) {
        return {
          rows: data as Record<string, unknown>[],
          schema: data.length > 0 && typeof data[0] === "object" && data[0] !== null
            ? Object.keys(data[0] as Record<string, unknown>).map((name) => ({ name, type: "unknown" }))
            : [],
        };
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
  const evalByRef = new Map<string, FlowCellEvaluation>();
  let lastQuery: unknown;

  const grid = buildFlowGrid(cells);
  ensureDbHandles(scope, ctx);

  const stack: FlowStackFrame[] = [];

  const recordOk = (cellRef: string, row: number, col: string, rawExpr: string, result?: unknown) => {
    const evaluation: FlowCellEvaluation = {
      row,
      col,
      expr: rawExpr,
      status: "ok",
    };
    if (result !== undefined) {
      evaluation.result = result;
    }
    evalByRef.set(cellRef, evaluation);
  };

  const recordError = (cellRef: string, row: number, col: string, rawExpr: string, message: string) => {
    evalByRef.set(cellRef, {
      row,
      col,
      expr: rawExpr,
      status: "error",
      error: message,
    });
  };

  const getCell = (loc: FlowLocation) => grid.getCell(loc.row, loc.colIndex);

  const nextAfter = (loc: FlowLocation, checkStack: boolean): FlowLocation | null =>
    setNext(grid, { row: loc.row, colIndex: loc.colIndex + 1 }, checkStack, stack);

  const nextFrom = (loc: FlowLocation, checkStack: boolean): FlowLocation | null =>
    setNext(grid, loc, checkStack, stack);

  const evalExpression = async (expression: string): Promise<unknown> => {
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
    const compiled = qValue === null ? compileExpression(expression, registry, defaultMemberRegistry) : null;
    let value = qValue === null ? compiled!.evaluate(scope) : qValue;
    if (value instanceof Promise) {
      value = await value;
    }
    return value;
  };

  const executeExpressionCell = async (cell: ReturnType<typeof getCell>): Promise<void> => {
    const rawExpr = cell.raw ?? "";
    const expression = (cell.normalizedExpr ?? "").trim();
    if (expression.length === 0) {
      recordError(cell.cellRef, cell.row, cell.col, rawExpr, "Empty expression");
      return;
    }
    try {
      const value = await evalExpression(expression);
      scope[cell.cellRef] = value;

      const queryResult = toQueryResult(value);
      if (queryResult) {
        lastQuery = queryResult;
      }

      recordOk(cell.cellRef, cell.row, cell.col, rawExpr, value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordError(cell.cellRef, cell.row, cell.col, rawExpr, message);
    }
  };

  const executeSameRowIfChain = async (ifCell: ReturnType<typeof getCell>): Promise<FlowLocation | null> => {
    const row = ifCell.row;
    const indentColIndex = ifCell.colIndex;
    const rawIf = ifCell.raw ?? "";

    const branches: Array<ReturnType<typeof getCell>> = [ifCell];
    let chainEndColIndex = indentColIndex + 1;

    // Find else/elseif branches on the same row to the right.
    for (let colIndex = indentColIndex + 2; colIndex <= grid.maxColIndex; colIndex++) {
      const cell = grid.getCell(row, colIndex);
      if (cell.kind === "command" && (cell.command?.kind === "elseif" || cell.command?.kind === "else")) {
        branches.push(cell);
        chainEndColIndex = Math.max(chainEndColIndex, cell.colIndex + 1);
        colIndex = cell.colIndex + 1;
      }
    }

    const evalCond = async (cell: ReturnType<typeof getCell>): Promise<boolean> => {
      const condExpr = cell.command?.rawArgs ?? "";
      if (condExpr.trim().length === 0) {
        recordError(cell.cellRef, cell.row, cell.col, cell.raw ?? "", "if/elseif requires a condition expression");
        return false;
      }
      try {
        const value = await evalExpression(condExpr);
        scope[cell.cellRef] = value;
        recordOk(cell.cellRef, cell.row, cell.col, cell.raw ?? "", value);
        return truthy(value);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordError(cell.cellRef, cell.row, cell.col, cell.raw ?? "", message);
        return false;
      }
    };

    const execBody = async (cmdCell: ReturnType<typeof getCell>): Promise<void> => {
      const bodyCell = grid.getCell(cmdCell.row, cmdCell.colIndex + 1);
      if (bodyCell.kind === "blank" || bodyCell.kind === "comment") {
        return;
      }
      if (bodyCell.kind !== "expression") {
        const kind = bodyCell.kind === "command" ? bodyCell.command?.kind ?? "unknown" : bodyCell.kind;
        recordError(bodyCell.cellRef, bodyCell.row, bodyCell.col, bodyCell.raw ?? "", `Unsupported cell in if branch body: ${kind}`);
        return;
      }
      await executeExpressionCell(bodyCell);
    };

    // Evaluate the primary if.
    const ifTaken = await evalCond(ifCell);
    if (ifTaken) {
      await execBody(ifCell);
      return nextFrom({ row, colIndex: chainEndColIndex + 1 }, true);
    }

    // Evaluate elseif/else branches left-to-right.
    for (const branch of branches.slice(1)) {
      const kind = branch.command?.kind;
      if (kind === "elseif") {
        const taken = await evalCond(branch);
        if (taken) {
          await execBody(branch);
          return nextFrom({ row, colIndex: chainEndColIndex + 1 }, true);
        }
        continue;
      }
      if (kind === "else") {
        scope[branch.cellRef] = null;
        recordOk(branch.cellRef, branch.row, branch.col, branch.raw ?? "", null);
        await execBody(branch);
        return nextFrom({ row, colIndex: chainEndColIndex + 1 }, true);
      }
    }

    // No branch taken.
    recordOk(ifCell.cellRef, ifCell.row, ifCell.col, rawIf, scope[ifCell.cellRef]);
    return nextFrom({ row, colIndex: chainEndColIndex + 1 }, true);
  };

  const executeMultiRowIfChain = async (ifCell: ReturnType<typeof getCell>): Promise<FlowLocation | null> => {
    const indentColIndex = ifCell.colIndex;
    const branches: Array<{ cmd: ReturnType<typeof getCell>; endRow: number }> = [];

    const ifEndRow = getCodeBlockEndRow(grid, ifCell.row, indentColIndex);
    branches.push({ cmd: ifCell, endRow: ifEndRow });

    let scanRow = ifEndRow + 1;
    while (scanRow <= grid.maxRow) {
      const nextCell = grid.getCell(scanRow, indentColIndex);
      if (nextCell.kind === "blank" || nextCell.kind === "comment") {
        scanRow += 1;
        continue;
      }
      if (nextCell.kind === "command" && (nextCell.command?.kind === "elseif" || nextCell.command?.kind === "else")) {
        const endRow = getCodeBlockEndRow(grid, nextCell.row, indentColIndex);
        branches.push({ cmd: nextCell, endRow });
        scanRow = endRow + 1;
        continue;
      }
      break;
    }

    const chainEndRow = branches[branches.length - 1].endRow;

    const evalCond = async (cell: ReturnType<typeof getCell>): Promise<boolean> => {
      const condExpr = cell.command?.rawArgs ?? "";
      if (condExpr.trim().length === 0) {
        recordError(cell.cellRef, cell.row, cell.col, cell.raw ?? "", "if/elseif requires a condition expression");
        return false;
      }
      try {
        const value = await evalExpression(condExpr);
        scope[cell.cellRef] = value;
        recordOk(cell.cellRef, cell.row, cell.col, cell.raw ?? "", value);
        return truthy(value);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordError(cell.cellRef, cell.row, cell.col, cell.raw ?? "", message);
        return false;
      }
    };

    const execIndentedBlock = async (startRow: number, endRow: number): Promise<void> => {
      let loc = setNext(grid, { row: startRow, colIndex: indentColIndex + 1 }, false, stack);
      while (loc) {
        if (loc.row > endRow) break;
        if (loc.colIndex <= indentColIndex) break;

        const cell = getCell(loc);
        if (cell.kind === "expression") {
          await executeExpressionCell(cell);
        } else if (cell.kind === "command") {
          const kind = cell.command?.kind ?? "unknown";
          recordError(cell.cellRef, cell.row, cell.col, cell.raw ?? "", `Unsupported command cell: ${kind}`);
        }

        loc = nextAfter(loc, false);
      }
    };

    // Primary if.
    if (await evalCond(ifCell)) {
      await execIndentedBlock(ifCell.row, ifEndRow);
      return setNext(grid, { row: chainEndRow + 1, colIndex: 1 }, true, stack);
    }

    // Elseif/else branches.
    for (const branch of branches.slice(1)) {
      const kind = branch.cmd.command?.kind;
      if (kind === "elseif") {
        if (await evalCond(branch.cmd)) {
          await execIndentedBlock(branch.cmd.row, branch.endRow);
          return setNext(grid, { row: chainEndRow + 1, colIndex: 1 }, true, stack);
        }
        continue;
      }
      if (kind === "else") {
        scope[branch.cmd.cellRef] = null;
        recordOk(branch.cmd.cellRef, branch.cmd.row, branch.cmd.col, branch.cmd.raw ?? "", null);
        await execIndentedBlock(branch.cmd.row, branch.endRow);
        return setNext(grid, { row: chainEndRow + 1, colIndex: 1 }, true, stack);
      }
    }

    // No branch taken.
    return setNext(grid, { row: chainEndRow + 1, colIndex: 1 }, true, stack);
  };

  const executeIfChain = async (ifCell: ReturnType<typeof getCell>): Promise<FlowLocation | null> => {
    // Same-row if/else form exists when an else/elseif command appears to the right.
    for (let colIndex = ifCell.colIndex + 1; colIndex <= grid.maxColIndex; colIndex++) {
      const cell = grid.getCell(ifCell.row, colIndex);
      if (cell.kind === "command" && (cell.command?.kind === "elseif" || cell.command?.kind === "else")) {
        return executeSameRowIfChain(ifCell);
      }
    }
    return executeMultiRowIfChain(ifCell);
  };

  let cur = setNext(grid, { row: 1, colIndex: 1 }, true, stack);
  while (cur) {
    const cell = getCell(cur);

    if (cell.kind === "expression") {
      await executeExpressionCell(cell);
      cur = nextAfter(cur, false);
      continue;
    }

    if (cell.kind === "command") {
      const kind = cell.command?.kind ?? "unknown";
      if (kind === "if") {
        cur = await executeIfChain(cell);
        continue;
      }
      recordError(cell.cellRef, cell.row, cell.col, cell.raw ?? "", `Unsupported command cell: ${kind}`);
      cur = nextAfter(cur, false);
      continue;
    }

    // Defensive: setNext shouldn't return blank/comment cells.
    cur = nextAfter(cur, false);
  }

  const evaluations: FlowCellEvaluation[] = grid.cells.map((cell) => {
    const existing = evalByRef.get(cell.cellRef);
    if (existing) return existing;

    if (cell.kind === "blank" || cell.kind === "comment") {
      return { row: cell.row, col: cell.col, expr: cell.raw ?? "", status: "ok" };
    }
    // Skipped cells (e.g., non-taken branches) are considered OK but produce no value.
    return { row: cell.row, col: cell.col, expr: cell.raw ?? "", status: "ok" };
  });

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
