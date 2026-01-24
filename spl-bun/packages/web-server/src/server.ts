/**
 * SPL IDE Backend Server
 *
 * This server:
 * 1. Initializes a demo SQLite database
 * 2. Handles DSL expression execution from frontend
 * 3. Returns query results with column headers
 */
import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { Database } from "bun:sqlite";
import { readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname, isAbsolute, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";
import {
  apiRoutes,
  type ExecuteRequest,
  type ExecuteResponse,
  type QueryResultData,
  type ExecuteCellResult,
} from "@esproc/web-shared";
import { buildFlowScope, evaluateFlow, type DBConnection, type DataSourceConfig } from "@esproc/spl-flow";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_WORKSPACE_ROOT = join(__dirname, "..");
const DEFAULT_DB_PATH = join(__dirname, "../data/demo.db");
const DEFAULT_INIT_SQL_PATH = join(__dirname, "../data/demo-init.sql");
const DEFAULT_EXTENSION_SQL_PATH = join(__dirname, "../data/demo-extension.sql");

const SALES_CSV_PATH = join(__dirname, "../data/sales.csv");
const PRODUCTS_CSV_PATH = join(__dirname, "../data/products.csv");
const CONFIG_JSON_PATH = join(__dirname, "../data/config.json");
const USERS_JSON_PATH = join(__dirname, "../data/users.json");

function parseEnvBool(value: string | undefined): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

function resolveMaybeRelativePath(input: string): string {
  // Used for resolving workspaceRoot only.
  return isAbsolute(input) ? input : resolvePath(process.cwd(), input);
}

function removeSqliteDbFiles(dbPath: string) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = `${dbPath}${suffix}`;
    if (!existsSync(p)) continue;
    try {
      rmSync(p, { force: true });
    } catch {
      // Best effort cleanup; startup will fail later if the file is truly locked.
    }
  }
}

type InitDatabaseOptions = {
  dbPath: string;
  initSqlPath: string;
  extensionSqlPath: string;
  resetDb: boolean;
};

/**
 * Initialize the demo SQLite database.
 *
 * - Base schema/data comes from demo-init.sql.
 * - Web-IDE extension tables come from demo-extension.sql (idempotent).
 */
function initDatabase(opts: InitDatabaseOptions): Database {
  const dbPath = opts.dbPath;
  const initSqlPath = opts.initSqlPath;
  const extensionSqlPath = opts.extensionSqlPath;

  const isMemoryDb = dbPath === ":memory:";

  if (!isMemoryDb) {
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  if (opts.resetDb && !isMemoryDb) {
    removeSqliteDbFiles(dbPath);
  }

  const dbExists = !isMemoryDb && existsSync(dbPath);
  const db = new Database(dbPath);

  if (dbExists && !opts.resetDb) {
    console.log(`[Server] Using existing demo.db at ${dbPath}`);
  } else {
    console.log(`[Server] Created new demo.db at ${dbPath}`);
    if (existsSync(initSqlPath)) {
      const initSql = readFileSync(initSqlPath, "utf-8");
      db.exec(initSql);
      console.log("[Server] Initialized database from demo-init.sql");
    } else {
      console.warn("[Server] Warning: demo-init.sql not found. Run 'bun run convert-demo' to generate it.");
    }
  }

  // Always ensure extension tables are present.
  if (existsSync(extensionSqlPath)) {
    const extensionSql = readFileSync(extensionSqlPath, "utf-8");
    db.exec(extensionSql);
  } else {
    console.warn(`[Server] Warning: demo-extension.sql not found at ${extensionSqlPath}`);
  }

  return db;
}

/**
 * Execute SQL and return results with column headers
 */
function executeQuery(db: Database, sql: string, params?: unknown[]): QueryResultData {
  const stmt = db.prepare(sql);
  const rows = (stmt as any).all(...((params ?? []) as any[])) as Record<string, unknown>[];

  // Extract column names from first row or query metadata
  let columns: string[] = [];
  if (rows.length > 0) {
    columns = Object.keys(rows[0]);
  } else {
    // Try to get columns from statement metadata
    columns = stmt.columnNames;
  }

  return { columns, rows };
}

function executeMutation(db: Database, sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | null } {
  const stmt = db.prepare(sql);
  const runner = stmt as unknown as { run: (...args: unknown[]) => { changes?: number; lastInsertRowid?: number | bigint } };
  const result = runner.run(...(params ?? []));
  const changes = typeof result.changes === "number" ? result.changes : 0;
  let lastInsertRowid: number | null = null;
  if (typeof result.lastInsertRowid === "number") {
    lastInsertRowid = result.lastInsertRowid;
  } else if (typeof result.lastInsertRowid === "bigint") {
    lastInsertRowid = Number(result.lastInsertRowid);
  }
  return { changes, lastInsertRowid };
}

export type CreateAppOptions = {
  dbPath?: string;
  initSqlPath?: string;
  extensionSqlPath?: string;
  workspaceRoot?: string;
  resetDb?: boolean;
};

export function createApp(options: CreateAppOptions = {}) {
  const workspaceRoot = resolveMaybeRelativePath(options.workspaceRoot ?? process.env.SPL_WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT);

  const resolveInWorkspace = (input: string) => (isAbsolute(input) ? input : resolvePath(workspaceRoot, input));

  const outDir = join(workspaceRoot, "data", "out");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const dbPathInput = options.dbPath ?? process.env.SPL_DEMO_DB_PATH ?? DEFAULT_DB_PATH;
  const initSqlPathInput = options.initSqlPath ?? process.env.SPL_DEMO_INIT_SQL_PATH ?? DEFAULT_INIT_SQL_PATH;
  const extensionSqlPathInput = options.extensionSqlPath ?? process.env.SPL_DEMO_EXTENSION_SQL_PATH ?? DEFAULT_EXTENSION_SQL_PATH;
  const resetDb = options.resetDb ?? parseEnvBool(process.env.SPL_DEMO_DB_RESET);

  const dbPath = resolveInWorkspace(dbPathInput);
  const initSqlPath = resolveInWorkspace(initSqlPathInput);
  const extensionSqlPath = resolveInWorkspace(extensionSqlPathInput);

  const db = initDatabase({ dbPath, initSqlPath, extensionSqlPath, resetDb });

  const connections = new Map<string, DBConnection>([["demo", { name: "demo", type: "sqlite", path: dbPath }]]);
  const dataSourceConfigs: DataSourceConfig[] = [
    { type: "sqlite", name: "demo", path: dbPath },
    { type: "csv", name: "sales", path: SALES_CSV_PATH, hasHeader: true },
    { type: "csv", name: "products", path: PRODUCTS_CSV_PATH, hasHeader: true },
    { type: "json", name: "config", path: CONFIG_JSON_PATH },
    { type: "json", name: "users", path: USERS_JSON_PATH },
  ];
  const databases = new Map<string, Database>([["demo", db]]);

  const app = new Elysia()
    .use(
      cors({
        origin: "*",
      })
    )
    .get(apiRoutes.health, () => ({ status: "ok" }))
    .post(apiRoutes.execute, async ({ body }): Promise<ExecuteResponse> => {
      const payload = body as ExecuteRequest;
      const expressions = payload?.flowDef ?? [];
      console.log("[Server] Received expressions:", expressions);

      if (!Array.isArray(expressions) || expressions.length === 0) {
        return { status: "error", error: "No expression provided" };
      }

      const executeAdapter = ({
        connection,
        sql,
        params,
      }: {
        connection?: DBConnection;
        sql: string;
        params?: unknown[];
      }) => {
        const target = connection?.name ?? "demo";
        const targetDb = databases.get(target);
        if (!targetDb) {
          throw new Error(`Connection '${target}' not found`);
        }
        return executeQuery(targetDb, sql, params);
      };

      const executeMutationAdapter = ({
        connection,
        sql,
        params,
      }: {
        connection?: DBConnection;
        sql: string;
        params?: unknown[];
      }) => {
        const target = connection?.name ?? "demo";
        const targetDb = databases.get(target);
        if (!targetDb) {
          throw new Error(`Connection '${target}' not found`);
        }
        return executeMutation(targetDb, sql, params);
      };

      const baseScope = buildFlowScope({
        connections,
        dataSourceConfigs,
        defaultDbPath: dbPath,
        workspaceRoot,
        adapters: {
          sqliteQuery: executeAdapter,
          sqliteExecute: executeMutationAdapter,
        },
      });

      let flowResult: Awaited<ReturnType<typeof evaluateFlow>>;
      try {
        flowResult = await evaluateFlow(expressions, {
          connections,
          dataSourceConfigs,
          defaultDbPath: dbPath,
          workspaceRoot,
          scope: baseScope,
          adapters: {
            sqliteQuery: executeAdapter,
            sqliteExecute: executeMutationAdapter,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: "error", error: message };
      }

      const { cells, lastQuery } = flowResult;

      const mappedCells: ExecuteCellResult[] = cells.map((cell) => ({
        expr: cell.expr,
        row: cell.row,
        col: cell.col,
        status: cell.status,
        result: cell.result,
        error: cell.error,
      }));

      const hasError = mappedCells.some((cell) => cell.status === "error");
      if (hasError) {
        const firstError = mappedCells.find((cell) => cell.status === "error");
        return { status: "error", error: firstError?.error ?? "Unknown error", cells: mappedCells };
      }

      const resultData = isQueryResult(lastQuery) ? (lastQuery as QueryResultData) : undefined;
      return { status: "ok", data: resultData, cells: mappedCells };
    });

  return {
    app,
    db,
    dispose: () => {
      try {
        db.close();
      } catch {
        // Best effort.
      }
    },
  };
}

if (import.meta.main) {
  const { app } = createApp();
  const PORT = Number(process.env.PORT ?? 4176);
  app.listen(PORT);
  console.log(`[Server] SPL IDE backend listening on http://localhost:${PORT}`);
}

function isQueryResult(value: unknown): value is QueryResultData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "columns" in (value as any) &&
      "rows" in (value as any) &&
      Array.isArray((value as any).columns) &&
      Array.isArray((value as any).rows)
  );
}
