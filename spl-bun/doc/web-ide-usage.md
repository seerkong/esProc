# Web IDE usage (stacked grids + runtime设计模式)

## Overview
- Package: `@esproc/web-ide` provides a spreadsheet-style IDE model. Authoring grid is a lightweight HTML/CSS table (A/B/C columns, editable), and results can be shown with AG Grid community when a DataSet has multiple rows.
- Cells map to SPL expressions/steps via `SpreadsheetModel`; execution uses the explicit `WebIdeRuntime` (wrapping `@esproc/composer`). No implicit DI; all side effects are provided through runtime contexts.
- Tech choice: custom authoring grid + optional AG Grid for result display (see `doc/web-ide-tech-selection.md`); behaviours mirror Java `PgmCellSet/PgmNormalCell` basics (cell expressions, A1 refs, dependency execution).

## Build a sheet
```ts
import { SpreadsheetModel } from "@esproc/web-ide";

const model = new SpreadsheetModel(runtime, [
  { ref: "A1", kind: "sql", expression: "SELECT id, price, active, 'eng' as dept FROM items" },
  { ref: "B1", kind: "sql", expression: "SELECT dept, manager FROM departments" },
  { ref: "A2", kind: "join", expression: "join depts", left: "A1", right: "B1", spec: { type: "left", leftKeys: ["dept"], rightKeys: ["dept"] } },
  { ref: "A3", kind: "compute", expression: "gross = price * 1.1", source: "A2", columns: { gross: "price * 1.1" } },
  { ref: "A4", kind: "filter", expression: "active = 1 and gross > 10", source: "A3" },
]);

const evaluation = await model.evaluate();
```
- Dependency order is inferred from explicit cell references and operation inputs; cycles raise errors.
- SQL cells use `runtime.adapters.sqliteQuery`; `defaultDbPath` can be set on runtime options.

## Authoring grid vs results grid
```ts
import { buildGridConfig } from "@esproc/web-ide";
import { Grid } from "ag-grid-community";
import { initAgGrid } from "@esproc/web-ide";

// Register modules + license (uses env VITE_AG_GRID_LICENSE_KEY or dev fallback)
initAgGrid();

const gridConfig = buildGridConfig(model, evaluation);
// gridConfig = { columnDefs, rowData, defaultColDef }, with columns A/B/C… and row numbers
// Use gridConfig to render the editable HTML table (A1-style).

// When a cell returns a DataSet, render it via AG Grid community:
const ds = evaluation.results.get("A4")?.value as DataSet;
new Grid(document.getElementById("result-grid")!, {
  columnDefs: ds.schema.map((c) => ({ field: c.name })),
  rowData: ds.rows,
});
```
- Column labels are generated (A, B, ...); row labels are numeric.
- Editing UX: the debug page supports add-row/add-column buttons and basic arrow-key navigation across the A/B/C… cells.

## Runtime wiring (runtime设计模式)
- `WebIdeRuntime` exposes explicit contexts: `options`, `outerCtx`, `innerCtx`, `errorCtx`, `support`, `adapters`.
- External side effects (SQLite queries, logging) are injected via constructor overrides—never via implicit globals.
- Default adapters delegate to the composer runtime; override for custom adapters or mocks.

## Tests
- Run `bun test` from `spl-bun/` to exercise DSL parsing and spreadsheet execution against sample fixtures.
- `bun run build` builds all workspace packages including `@esproc/web-ide`.

## Debug page
- Start the demo + backend from repo root: `bun run web-ide:dev` (spawns `@esproc/web-server` on 4174 and serves http://localhost:4173 for the UI).
- Expressions live in `packages/web-ide/debug/demo.ts`; the result grid uses AG Grid community for DataSet outputs.
