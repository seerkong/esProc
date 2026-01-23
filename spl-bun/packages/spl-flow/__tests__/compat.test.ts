import { describe, expect, test } from "bun:test";

import { evaluateFlow, type FlowCell } from "../src";

describe("spl-flow compatibility", () => {
  test("accepts leading '=' and '>' prefixes", async () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "=1 + 2" },
      { row: 2, col: "A", expr: ">1 + 2" },
      { row: 3, col: "A", expr: "1 + 2" },
    ];

    const res = await evaluateFlow(cells, {});
    expect(res.cells.every((c) => c.status === "ok")).toBe(true);
    expect(res.scope.A1).toBe(3);
    expect(res.scope.A2).toBe(3);
    expect(res.scope.A3).toBe(3);
  });

  test("treats if(...) as expression, not a statement command", async () => {
    const cells: FlowCell[] = [{ row: 1, col: "A", expr: "if(1==1, 1, 2)" }];
    const res = await evaluateFlow(cells, {});
    expect(res.cells[0].status).toBe("ok");
    expect(res.scope.A1).toBe(1);
  });

  test("skips comment cells without setting scope", async () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "// comment" },
      { row: 2, col: "A", expr: "1 + 1" },
    ];
    const res = await evaluateFlow(cells, {});
    expect(res.cells.every((c) => c.status === "ok")).toBe(true);
    expect("A1" in res.scope).toBe(false);
    expect(res.scope.A2).toBe(2);
  });
});
