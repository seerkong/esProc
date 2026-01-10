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
  type ExecuteStepResult,
} from "@esproc/web-shared";
import { compileDSL, type DBConnection } from "@esproc/spl-dsl";

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
    const expressions = body as ExecuteRequest;
    console.log("[Server] Received expressions:", expressions);

    if (!Array.isArray(expressions) || expressions.length === 0) {
      return { status: "error", error: "No expression provided" };
    }

    const steps: ExecuteStepResult[] = [];
    const scope: Record<string, unknown> = {};
    let lastQueryResult: QueryResultData | undefined;

    for (const item of expressions) {
      const { expr: expression, row, col } = item ?? {};
      const ref = `${String(col ?? "").toUpperCase()}${row ?? ""}`;

      if (!expression) {
        steps.push({ expression: "", row: row ?? -1, col: col ?? "", status: "error", error: "Empty expression" });
        continue;
      }

      try {
        const compiled = compileDSL(expression);
        const value = await compiled.evaluate({
          connections,
          defaultDbPath: DB_PATH,
          scope,
          adapters: {
            sqliteQuery: ({ connection, sql, params }) => {
              const target = connection?.name ?? "demo";
              const targetDb = databases.get(target);
              if (!targetDb) {
                throw new Error(`Connection '${target}' not found`);
              }
              return executeQuery(targetDb, sql, params);
            },
          },
        });

        console.log("[Server] Evaluated DSL node type:", compiled.node.type);

        if (isQueryResult(value)) {
          lastQueryResult = value;
          scope[ref] = value;
          steps.push({ expression, row, col, status: "ok", data: value });
          console.log(`[Server] Query returned ${value.rows.length} rows, columns: ${value.columns.join(", ")}`);
        } else {
          scope[ref] = value;
          steps.push({ expression, row, col, status: "ok", value });
        }
      } catch (err: any) {
        console.error("[Server] Error:", err);
        const errorMessage = err?.message ?? String(err);
        steps.push({ expression, row, col, status: "error", error: errorMessage });
        return { status: "error", error: errorMessage, steps };
      }
    }

    return { status: "ok", data: lastQueryResult, steps };
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
