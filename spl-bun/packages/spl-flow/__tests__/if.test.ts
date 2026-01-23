import { describe, expect, test } from "bun:test";

import { evaluateFlow, type FlowCell } from "../src";

describe("spl-flow if/elseif/else", () => {
  test("multi-row if/elseif/else selects the right branch", async () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "if x > 0" },
      { row: 1, col: "B", expr: "x * 2" },
      { row: 2, col: "A", expr: "else if x == 0" },
      { row: 2, col: "B", expr: "100" },
      { row: 3, col: "A", expr: "else" },
      { row: 3, col: "B", expr: "-1" },
    ];

    const res = await evaluateFlow(cells, { scope: { x: 0 } });
    expect(res.scope.B2).toBe(100);
    expect("B1" in res.scope).toBe(false);
    expect("B3" in res.scope).toBe(false);
  });

  test("same-row if/else executes only the taken branch", async () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "if x > 0" },
      { row: 1, col: "B", expr: "10" },
      { row: 1, col: "C", expr: "else" },
      { row: 1, col: "D", expr: "-10" },
    ];

    const res = await evaluateFlow(cells, { scope: { x: 1 } });
    expect(res.scope.B1).toBe(10);
    expect("D1" in res.scope).toBe(false);
  });

  test("supports 'elseif' keyword without a space", async () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "if x > 0" },
      { row: 1, col: "B", expr: "1" },
      { row: 2, col: "A", expr: "elseif x == 0" },
      { row: 2, col: "B", expr: "2" },
      { row: 3, col: "A", expr: "else" },
      { row: 3, col: "B", expr: "3" },
    ];

    const res = await evaluateFlow(cells, { scope: { x: 0 } });
    expect(res.scope.B2).toBe(2);
    expect("B1" in res.scope).toBe(false);
    expect("B3" in res.scope).toBe(false);
  });
});
