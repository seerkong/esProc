import { describe, expect, test } from "bun:test";
import { DataSet } from "@esproc/core";
import { SpreadsheetModel } from "../src/sheet";
import { buildGridConfig } from "../src/gridBridge";
import { createWebIdeRuntime } from "../src/runtime";

describe("SpreadsheetModel execution with DSL and vertical layout", () => {
  test("evaluates dsl + join + compute + filter vertically", async () => {
    const runtime = createWebIdeRuntime({
      adapters: {
        sqliteQuery: ({ sql }) => {
          if (sql.includes("manager")) {
            return DataSet.fromRows([
              { dept: "eng", manager: "mike" },
              { dept: "sales", manager: "sara" },
            ]);
          }
          return DataSet.fromRows([{ id: 1, name: "widget", price: 10.5, active: 1, dept: "eng" }]);
        },
      },
    });

    const model = new SpreadsheetModel(runtime, [
      { ref: "A1", kind: "dsl", expression: `$q("select * from items")` },
      { ref: "A2", kind: "dsl", expression: `$q("select * from managers")` },
      {
        ref: "A3",
        kind: "join",
        expression: "join departments",
        left: "A1",
        right: "A2",
        spec: { type: "left", leftKeys: ["dept"], rightKeys: ["dept"], rightPrefix: "mgr_" },
      },
      {
        ref: "A4",
        kind: "compute",
        expression: "gross price",
        source: "A3",
        columns: { gross: "price * 1.1" },
      },
      { ref: "A5", kind: "filter", expression: "gross > 9", source: "A4" },
    ]);

    const evaluation = await model.evaluate();
    expect(evaluation.errors).toEqual([]);

    const finalResult = evaluation.results.get("A5")?.value;
    expect(finalResult instanceof DataSet).toBe(true);
    const rows = (finalResult as DataSet).rows;
    expect(rows.length).toBe(1);
    expect(rows[0]).toHaveProperty("manager");

    const grid = buildGridConfig(model, evaluation);
    expect(grid.columnDefs.map((c) => c.headerName)).toEqual(["#", "A", "B", "C", "D", "E"]);
    expect((grid.rowData[0] as any).A.ref).toBe("A1");
    expect((grid.rowData[4] as any).A.ref).toBe("A5");
  });
});
