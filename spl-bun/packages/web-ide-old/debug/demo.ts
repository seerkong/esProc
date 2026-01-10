import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { createGrid, type GridOptions, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { initAgGrid } from "../src/agGridInit";
import { SpreadsheetModel } from "../src/sheet";
import { createWebIdeRuntime } from "../src/runtime";
import { DataSet } from "@esproc/core";

import "@univerjs/preset-sheets-core/lib/index.css";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

ModuleRegistry.registerModules([AllCommunityModule]);
initAgGrid({ logger: (msg) => console.log(msg) });

const runtime = createWebIdeRuntime({
  support: { logger: (msg) => console.log(msg) },
});

const resultGridEl = document.getElementById("result-grid") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

let destroyResultGrid: (() => void) | undefined;

const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
  },
  presets: [
    UniverSheetsCorePreset({
      container: "univer",
    }),
  ],
});

const workbook = univerAPI.createWorkbook({
  id: "workbook-01",
  name: "Sheet DSL",
  sheetOrder: ["sheet1"],
  sheets: {
    sheet1: {
      id: "sheet1",
      name: "Sheet1",
      cellData: {
        0: {
          0: { v: "=select 1 as id, 'widget' as name, 10.5 as price, 1 as active, 'eng' as dept" },
        },
      },
      rowCount: 20,
      columnCount: 8,
    },
  },
});

function collectCells() {
  const cells: { ref: string; expression: string }[] = [];
  if (!workbook) return cells;
  const sheet = workbook.getActiveSheet();
  if (!sheet) return cells;
  const rowCount = sheet.getRange(0, 0).getSheet().getRowCount();
  const colCount = sheet.getRange(0, 0).getSheet().getColumnCount();
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const range = sheet.getRange(r, c);
      const val = range?.getValue();
      const text = val === undefined || val === null ? "" : String(val);
      const trimmed = text.trim();
      if (!trimmed) continue;
      const expr = trimmed.startsWith("=") ? trimmed.slice(1) : trimmed;
      const colLabel = String.fromCharCode(65 + c);
      const ref = `${colLabel}${r + 1}`;
      cells.push({ ref, expression: expr });
    }
  }
  return cells;
}

function renderResultGrid(dataset?: DataSet) {
  if (destroyResultGrid) {
    destroyResultGrid();
    destroyResultGrid = undefined;
  }
  resultGridEl.innerHTML = "";
  if (!dataset) {
    resultGridEl.textContent = "No DataSet result";
    return;
  }
  const columnDefs = dataset.schema.map((c) => ({ field: c.name, headerName: c.name }));
  const options: GridOptions = {
    columnDefs,
    rowData: dataset.rows,
    defaultColDef: { resizable: true, sortable: true },
    suppressMovableColumns: true,
  };
  const api = createGrid(resultGridEl, options);
  destroyResultGrid = () => api.destroy();
}

async function run() {
  try {
    statusEl.textContent = "Running...";
    const cells = collectCells().map((c) => ({ ref: c.ref, kind: "dsl" as const, expression: c.expression }));
    const sheet = new SpreadsheetModel(runtime, cells);
    const evaluation = await sheet.evaluate();
    const ds = pickFirstDataSet(evaluation.results);
    renderResultGrid(ds);
    statusEl.textContent = "Done";
  } catch (err: any) {
    console.error(err);
    statusEl.textContent = `Error: ${err?.message ?? err}`;
  }
}

function pickFirstDataSet(results: Map<string, any>): DataSet | undefined {
  for (const [_ref, value] of results.entries()) {
    if (value?.value instanceof DataSet) {
      return value.value as DataSet;
    }
  }
  return undefined;
}

document.getElementById("run")?.addEventListener("click", () => {
  run();
});

document.getElementById("add-row")?.addEventListener("click", () => {
  if (!workbook) return;
  const sheet = workbook.getActiveSheet();
  if (!sheet) return;
  const rowCount = sheet.getRange(0, 0).getSheet().getRowCount();
  sheet.insertRowAfter(rowCount - 1);
});

document.getElementById("add-col")?.addEventListener("click", () => {
  if (!workbook) return;
  const sheet = workbook.getActiveSheet();
  if (!sheet) return;
  const colCount = sheet.getRange(0, 0).getSheet().getColumnCount();
  sheet.insertColumnAfter(colCount - 1);
});
