import { describe, expect, test } from "bun:test";

import { collectFlowDefFromSheet, type SheetLike } from "../src/utils/collectFlowDef";

describe("collectFlowDefFromSheet", () => {
  test("collects non-empty cells across columns", () => {
    const values = new Map<string, unknown>([
      ["0,0", " a = 1 "],
      ["1,1", " b = a + 1 "],
      ["2,0", ""],
      ["2,1", null],
    ]);

    const sheet: SheetLike = {
      getRange: (r, c) => ({
        getValue: () => values.get(`${r},${c}`),
      }),
    };

    const flowDef = collectFlowDefFromSheet(sheet, { maxRows: 3, maxCols: 3 });
    expect(flowDef).toEqual([
      { row: 1, col: "A", expr: "a = 1" },
      { row: 2, col: "B", expr: "b = a + 1" },
    ]);
  });
});
