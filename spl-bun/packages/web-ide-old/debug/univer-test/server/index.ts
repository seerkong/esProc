/**
 * SPL IDE Backend Server
 *
 * This server:
 * 1. Initializes a demo SQLite database with STATES table
 * 2. Handles DSL expression execution from frontend
 * 3. Returns query results with column headers
 */

import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { Database } from "bun:sqlite";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "demo.db");
const INIT_SQL_PATH = join(__dirname, "demo-init.sql");

/**
 * Initialize the demo SQLite database
 */
function initDatabase(): Database {
  // Remove existing database to ensure fresh start
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log("[Server] Removed existing demo.db");
  }

  const db = new Database(DB_PATH);
  console.log("[Server] Created new demo.db");

  // Read and execute initialization SQL
  const initSql = readFileSync(INIT_SQL_PATH, "utf-8");
  db.exec(initSql);
  console.log("[Server] Initialized STATES table with 51 records");

  return db;
}

/**
 * Parse demo.query("sql") syntax and extract the SQL
 *
 * NOTE: This is a temporary workaround. The Java esProc implementation uses
 * demo.query("sql") syntax, but our spl-dsl currently only supports $q("sql").
 * This function converts demo.query to extract the SQL directly.
 *
 * TODO: Update spl-dsl to support demo.query syntax for consistency with Java esProc
 */
function parseDemoQuery(expression: string): { dbName: string; sql: string } | null {
  // Match pattern: demo.query("...") or demo.query('...')
  const match = expression.match(/^(\w+)\.query\(["'](.+?)["']\)$/s);
  if (match) {
    return {
      dbName: match[1],
      sql: match[2],
    };
  }
  return null;
}

/**
 * Execute SQL and return results with column headers
 */
function executeQuery(
  db: Database,
  sql: string
): { columns: string[]; rows: Record<string, unknown>[] } {
  const stmt = db.prepare(sql);
  const rows = stmt.all() as Record<string, unknown>[];

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

// Initialize database
const db = initDatabase();

// Create Elysia server
const app = new Elysia()
  .use(
    cors({
      origin: "*",
    })
  )
  .get("/api/health", () => ({ status: "ok" }))
  .post("/api/execute", async ({ body }) => {
    const expressions = body as string[];

    console.log("[Server] Received expressions:", expressions);

    try {
      // For now, we only process the first expression
      // TODO: Support multiple expressions with cell dependencies
      const expression = expressions[0];

      if (!expression) {
        return { status: "error", error: "No expression provided" };
      }

      // Parse demo.query syntax
      const parsed = parseDemoQuery(expression);

      if (!parsed) {
        // NOTE: Temporary fallback - if not demo.query syntax, try as raw SQL
        // This differs from Java esProc which requires explicit database reference
        console.log("[Server] Expression not in demo.query format, treating as raw SQL");
        try {
          const result = executeQuery(db, expression);
          return { status: "ok", data: result };
        } catch (err: any) {
          return { status: "error", error: `Invalid expression or SQL: ${err.message}` };
        }
      }

      console.log(`[Server] Parsed: db=${parsed.dbName}, sql=${parsed.sql}`);

      // NOTE: Currently we only support the "demo" database
      // This is a temporary limitation - Java esProc supports multiple database connections
      if (parsed.dbName !== "demo") {
        return {
          status: "error",
          error: `Database "${parsed.dbName}" not supported. Only "demo" is available.`,
        };
      }

      // Execute the query
      const result = executeQuery(db, parsed.sql);

      console.log(`[Server] Query returned ${result.rows.length} rows, columns: ${result.columns.join(", ")}`);

      return { status: "ok", data: result };
    } catch (err: any) {
      console.error("[Server] Error:", err);
      return { status: "error", error: err.message };
    }
  });

// Start server
const PORT = 4175;
app.listen(PORT);
console.log(`[Server] SPL IDE backend listening on http://localhost:${PORT}`);

export { app };
