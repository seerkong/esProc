import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { apiRoutes, type ExecuteRequest } from "@esproc/web-shared";
import { createApp } from "../src/server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../data");
// Deterministic, ignored test DB. Rebuilt from SQL on each test run.
const testDbPath = join(dataDir, "out", "demo.test.db");
const salesCsvPath = join(dataDir, "sales.csv");
const productsCsvPath = join(dataDir, "products.csv");
const configJsonPath = join(dataDir, "config.json");
const usersJsonPath = join(dataDir, "users.json");

const { app } = createApp({ dbPath: testDbPath, resetDb: true });

async function postExecute(payload: ExecuteRequest) {
  const res = await app.handle(
    new Request(`http://localhost${apiRoutes.execute}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
  expect(res.status).toBe(200);
  return res.json();
}

describe("web-server DSL execution (sqlite integration)", () => {
  test("includes CSV demo files with expected headers", () => {
    expect(existsSync(salesCsvPath)).toBe(true);
    expect(existsSync(productsCsvPath)).toBe(true);

    const salesHeader = readFileSync(salesCsvPath, "utf-8").split("\n")[0]?.trim();
    const productsHeader = readFileSync(productsCsvPath, "utf-8").split("\n")[0]?.trim();

    expect(salesHeader).toBe("id,product,amount,date,region");
    expect(productsHeader).toBe("id,name,category,price");
  });

  test("includes JSON demo files with expected shape", () => {
    expect(existsSync(configJsonPath)).toBe(true);
    expect(existsSync(usersJsonPath)).toBe(true);

    const config = JSON.parse(readFileSync(configJsonPath, "utf-8"));
    const users = JSON.parse(readFileSync(usersJsonPath, "utf-8"));

    expect(config.settings?.database?.host).toBeDefined();
    expect(config.settings?.api?.baseUrl).toBeDefined();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(10);
    expect(users[0]).toHaveProperty("id");
    expect(users[0]).toHaveProperty("profile");
  });

  test("executes multi-step demo.query against sqlite", async () => {
    const result = await postExecute({
      flowDef: [
        { row: 1, col: "A", expr: `demo.query("select * from AREA limit 1")` },
        { row: 2, col: "A", expr: `demo.query("select * from AREA limit 2")` },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.cells.length).toBe(2);
    expect(result.cells[0].status).toBe("ok");
    expect(result.cells[1].status).toBe("ok");
    expect(result.data.columns).toContain("AREAID");
    expect(result.data.rows.length).toBe(2);
  });

  test("exposes orders and customers tables", async () => {
    const result = await postExecute({
      flowDef: [
        { row: 1, col: "A", expr: `demo.query("select count(*) as cnt from CUSTOMERS")` },
        { row: 2, col: "A", expr: `demo.query("select count(*) as cnt from ORDERS")` },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.cells[0].result.rows[0]?.cnt).toBeGreaterThanOrEqual(20);
    expect(result.cells[1].result.rows[0]?.cnt).toBeGreaterThanOrEqual(100);
  });

  test("supports parameter binding in demo.query", async () => {
    const result = await postExecute({
      flowDef: [
        { row: 1, col: "A", expr: `demo.query("select AREANAME from AREA where AREAID = ?", 10)` },
        { row: 2, col: "A", expr: `demo.query("select AREANAME from AREA where AREAID = ?", 11)` },
        { row: 3, col: "A", expr: `demo.query("select AREANAME from AREA where AREAID = ?", 12)` },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.cells[0].result.rows[0]?.AREANAME?.trim()).toBe("HuNan");
    expect(result.data.rows[0]?.AREANAME?.trim()).toBe("GuangDong");
  });

  test("allows referencing previous step result via cell ref", async () => {
    const result = await postExecute({
      flowDef: [
        { row: 1, col: "A", expr: `demo.query("select * from AREA limit 3")` },
        { row: 2, col: "A", expr: "A1.count()" },
        { row: 3, col: "A", expr: `demo.query("select * from AREA limit 3")` },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.cells[1].result).toBe(3);
    expect(result.data.rows.length).toBe(3);
  });

  test("returns error for unknown connection", async () => {
    const result = await postExecute({
      flowDef: [{ row: 1, col: "A", expr: `unknown.query("select 1")` }],
    });
    expect(result.status).toBe("error");
    expect(result.cells?.[0].status).toBe("error");
    expect(String(result.error)).toContain("Connection 'unknown' not found");
  });

  test("try captures errors without failing the response", async () => {
    const result = await postExecute({
      flowDef: [
        { row: 1, col: "A", expr: "try" },
        { row: 2, col: "B", expr: "unknownFunc()" },
        { row: 3, col: "A", expr: 'rows = [ { name: "try", value: A1 } ]' },
        { row: 4, col: "A", expr: 'out = { columns: ["name", "value"], rows: rows }' },
        { row: 5, col: "A", expr: "out" },
      ],
    });

    expect(result.status).toBe("ok");
    expect(result.data.columns).toEqual(["name", "value"]);
    expect(result.data.rows[0]?.name).toBe("try");
    expect(String(result.data.rows[0]?.value ?? "")).not.toBe("");
    expect(result.cells.every((cell: any) => cell.status === "ok")).toBe(true);
  });

  test("end terminates with a structured error message", async () => {
    const result = await postExecute({
      flowDef: [{ row: 1, col: "A", expr: 'end "boom"' }],
    });
    expect(result.status).toBe("error");
    expect(String(result.error)).toContain("boom");
  });

});
