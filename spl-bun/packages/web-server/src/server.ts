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
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  apiRoutes,
  type ExecuteRequest,
  type ExecuteResponse,
  type QueryResultData,
  type ExecuteCellResult,
} from "@esproc/web-shared";
import { buildFlowScope, evaluateFlow, type DBConnection } from "@esproc/spl-flow";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "../data/demo.db");
const INIT_SQL_PATH = join(__dirname, "../data/demo-init.sql");

/**
 * Initialize the demo SQLite database
 */
function initDatabase(): Database {
  // Ensure data directory exists
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Check if database already exists
  const dbExists = existsSync(DB_PATH);
  const db = new Database(DB_PATH);

  if (dbExists) {
    console.log("[Server] Using existing demo.db");
  } else {
    console.log("[Server] Created new demo.db");
    // Read and execute initialization SQL
    if (existsSync(INIT_SQL_PATH)) {
      const initSql = readFileSync(INIT_SQL_PATH, "utf-8");
      db.exec(initSql);
      console.log("[Server] Initialized database from demo-init.sql");
    } else {
      console.warn("[Server] Warning: demo-init.sql not found. Run 'bun run convert-demo' to generate it.");
    }
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

// Initialize database and connection registry
const db = initDatabase();
const connections = new Map<string, DBConnection>([
  ["demo", { name: "demo", type: "sqlite", path: DB_PATH }],
]);
const databases = new Map<string, Database>([["demo", db]]);

// Create Elysia server
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

    const executeAdapter = ({ connection, sql, params }: { connection?: DBConnection; sql: string; params?: unknown[] }) => {
      const target = connection?.name ?? "demo";
      const targetDb = databases.get(target);
      if (!targetDb) {
        throw new Error(`Connection '${target}' not found`);
      }
      return executeQuery(targetDb, sql, params);
    };

    const executeMutationAdapter = ({ connection, sql, params }: { connection?: DBConnection; sql: string; params?: unknown[] }) => {
      const target = connection?.name ?? "demo";
      const targetDb = databases.get(target);
      if (!targetDb) {
        throw new Error(`Connection '${target}' not found`);
      }
      return executeMutation(targetDb, sql, params);
    };

    const baseScope = buildFlowScope({
      connections,
      defaultDbPath: DB_PATH,
      adapters: {
        sqliteQuery: executeAdapter,
        sqliteExecute: executeMutationAdapter,
      },
    });

    const { cells, lastQuery } = await evaluateFlow(expressions, {
      connections,
      defaultDbPath: DB_PATH,
      scope: baseScope,
      adapters: {
        sqliteQuery: executeAdapter,
        sqliteExecute: executeMutationAdapter,
      },
    });

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

// Start server
const PORT = Number(process.env.PORT ?? 4176);
app.listen(PORT);
console.log(`[Server] SPL IDE backend listening on http://localhost:${PORT}`);

export { app };

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
