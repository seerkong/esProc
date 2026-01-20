import { describe, expect, test } from "bun:test";
import { buildFlowScope, evaluateFlow, type FlowCell } from "../src";

describe("spl-flow evaluation", () => {
  test("evaluates expressions and stores results by cell ref", async () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "a + b" },
      { row: 2, col: "A", expr: "A1 + 3" },
    ];
    const result = await evaluateFlow(cells, { scope: { a: 2, b: 3 } });
    expect(result.cells[0].status).toBe("ok");
    expect(result.scope.A1).toBe(5);
    expect(result.scope.A2).toBe(8);
  });

  test("uses db handles for query member calls", async () => {
    const calls: any[] = [];
    const connections = new Map([["demo", { name: "demo", type: "sqlite" }]]);
    const scope = buildFlowScope({
      connections,
      defaultDbPath: "db.sqlite",
      adapters: { sqliteQuery: (opts) => calls.push(opts) },
    });
    const result = await evaluateFlow(
      [{ row: 1, col: "A", expr: `demo.query("select * from t where id = ?", 7)` }],
      {
        scope,
        connections,
        defaultDbPath: "db.sqlite",
        adapters: { sqliteQuery: (opts) => calls.push(opts) },
      },
    );
    expect(result.cells[0].status).toBe("ok");
    expect(calls.length).toBe(1);
    expect(calls[0].sql).toBe("select * from t where id = ?");
    expect(calls[0].params).toEqual([7]);
  });

  test("flags unknown connection in scope lookup", async () => {
    const result = await evaluateFlow([{ row: 1, col: "A", expr: "unknown.query(\"select 1\")" }], {
      scope: {},
      connections: new Map(),
      adapters: { sqliteQuery: () => null },
    });
    expect(result.cells[0].status).toBe("error");
    expect(result.cells[0].error).toContain("Connection 'unknown' not found");
  });

  test("uses dataSourceConfigs for query member calls", async () => {
    const cells: FlowCell[] = [{ row: 1, col: "A", expr: `sales.query("select id from csv_data")` }];
    const result = await evaluateFlow(cells, {
      dataSourceConfigs: [{ type: "csv", name: "sales", path: "./sample.csv" }],
    });
    expect(result.cells[0].status).toBe("error");
    expect(String(result.cells[0].error)).toContain("no such file or directory");
    expect(result.cells[0].error).toBeDefined();
  });
});
