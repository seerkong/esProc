import { describe, expect, test } from "bun:test";

import type { FlowCell } from "../src";
import { buildFlowGrid, colToIndex, indexToCol } from "../src/flow/grid";

describe("spl-flow grid model", () => {
  test("colToIndex/indexToCol roundtrip", () => {
    expect(colToIndex("A")).toBe(1);
    expect(colToIndex("Z")).toBe(26);
    expect(colToIndex("AA")).toBe(27);
    expect(colToIndex("AZ")).toBe(52);
    expect(colToIndex("BA")).toBe(53);

    expect(indexToCol(1)).toBe("A");
    expect(indexToCol(26)).toBe("Z");
    expect(indexToCol(27)).toBe("AA");
    expect(indexToCol(52)).toBe("AZ");
    expect(indexToCol(53)).toBe("BA");
  });

  test("normalizes cell refs and classifies cell kinds", () => {
    const cells: FlowCell[] = [
      { row: 1, col: "A", expr: "  " },
      { row: 2, col: "A", expr: "// comment" },
      { row: 3, col: "A", expr: "/ comment" },
      { row: 4, col: "A", expr: "1 + 2" },
      { row: 5, col: "a", expr: "=1 + 2" },
      { row: 6, col: "A", expr: ">1 + 2" },
      { row: 7, col: "A", expr: "if x > 0" },
      { row: 8, col: "A", expr: "ELSE if x == 0" },
      { row: 9, col: "A", expr: "elseif x == 0" },
      { row: 10, col: "A", expr: "continue" },
      { row: 11, col: "A", expr: "if(1==1, 1, 2)" },
    ];

    const grid = buildFlowGrid(cells);

    expect(grid.getCellByRef("A1")?.kind).toBe("blank");
    expect(grid.getCellByRef("A2")?.kind).toBe("comment");
    expect(grid.getCellByRef("A3")?.kind).toBe("comment");

    expect(grid.getCellByRef("A4")?.kind).toBe("expression");
    expect(grid.getCellByRef("A4")?.normalizedExpr).toBe("1 + 2");
    expect(grid.getCellByRef("A5")?.normalizedExpr).toBe("1 + 2");
    expect(grid.getCellByRef("A6")?.normalizedExpr).toBe("1 + 2");

    expect(grid.getCellByRef("A7")?.kind).toBe("command");
    expect(grid.getCellByRef("A7")?.command?.kind).toBe("if");

    expect(grid.getCellByRef("A8")?.command?.kind).toBe("elseif");
    expect(grid.getCellByRef("A9")?.command?.kind).toBe("elseif");
    expect(grid.getCellByRef("A10")?.command?.kind).toBe("next");

    // `if(...)` is an expression function call, not a statement command.
    expect(grid.getCellByRef("A11")?.kind).toBe("expression");
  });

  test("grid lookup supports row/col addressing", () => {
    const cells: FlowCell[] = [
      { row: 1, col: "B", expr: "1" },
      { row: 2, col: "AA", expr: "2" },
    ];

    const grid = buildFlowGrid(cells);

    expect(grid.getCell(1, "b")?.cellRef).toBe("B1");
    expect(grid.getCell(2, "AA")?.cellRef).toBe("AA2");

    // Missing cells are treated as blank for control-flow navigation.
    expect(grid.getCell(1, "A")?.kind).toBe("blank");
    expect(grid.getCellByRef("Z9")?.kind).toBe("blank");
  });
});
