<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import type { FUniver, FWorkbook } from "@univerjs/presets";
import { createGrid, type GridApi, type GridOptions, type ColDef } from "ag-grid-community";
import { apiRoutes, type ExecuteRequest, type ExecuteResponse, type QueryResultData } from "@esproc/web-shared";
import { initAgGrid } from "../utils/agGridInit";

import "@univerjs/preset-sheets-core/lib/index.css";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

// Initialize AG Grid modules
initAgGrid();

// Backend server URL - configurable via environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4176";

const univerContainerRef = ref<HTMLDivElement>();
const agGridContainerRef = ref<HTMLDivElement>();

const status = ref<string>("Idle");

let univerAPI: FUniver | null = null;
let workbook: FWorkbook | null = null;
let gridApi: GridApi | null = null;

onMounted(() => {
  if (!univerContainerRef.value) return;

  // Create Univer WITHOUT formula engine (No Formula Engine mode)
  const { univerAPI: api } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
    },
    presets: [
      UniverSheetsCorePreset({
        container: univerContainerRef.value,
        // Disable formula bar UI
        formulaBar: false,
      }),
    ],
  });

  univerAPI = api;

  // Create workbook - A1 contains demo.query expression
  workbook = univerAPI.createWorkbook({
    id: "workbook-01",
    name: "SPL Sheet",
    sheetOrder: ["sheet1"],
    sheets: {
      sheet1: {
        id: "sheet1",
        name: "Sheet1",
        cellData: {
          0: {
            0: { v: 'demo.query("select * from STATES")' },
          },
        },
        rowCount: 20,
        columnCount: 8,
      },
    },
  });

  console.log("[SPL-IDE] Univer created without formula engine");

  // Initialize AG Grid with empty config
  if (agGridContainerRef.value) {
    const gridOptions: GridOptions = {
      columnDefs: [],
      rowData: [],
      defaultColDef: {
        resizable: true,
        sortable: true,
        filter: true,
        flex: 1,
        minWidth: 100,
      },
      suppressMovableColumns: true,
    };

    gridApi = createGrid(agGridContainerRef.value, gridOptions);
  }
});

onUnmounted(() => {
  univerAPI?.disposeUniver();
  gridApi?.destroy();
});

/**
 * Collect all non-empty values from column A (column index 0)
 * Returns an array of strings
 */
function collectColumnA(): ExecuteRequest {
  if (!workbook) return [];

  const sheet = workbook.getActiveSheet();
  if (!sheet) return [];

  const expressions: ExecuteRequest = [];

  // Scan column A (column index 0) for non-empty cells
  for (let r = 0; r < 20; r++) {
    const range = sheet.getRange(r, 0);
    const val = range?.getValue();

    if (val !== undefined && val !== null && val !== "") {
      expressions.push({ row: r + 1, col: "A", expr: String(val) });
    }
  }

  return expressions;
}

/**
 * Run sheet: collect expressions from column A, send to backend, display results
 */
async function runSheet() {
  status.value = "Running...";

  try {
    const expressions: ExecuteRequest = collectColumnA();

    if (expressions.length === 0) {
      status.value = "No expressions to evaluate";
      return;
    }

    console.log("[SPL-IDE] Sending expressions to backend:", expressions);

    // Send expressions to backend using shared API routes
    const response = await fetch(`${API_BASE_URL}${apiRoutes.execute}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(expressions),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const result: ExecuteResponse = await response.json();
    console.log("[SPL-IDE] Received result from backend:", result);

    // Display result in AG Grid
    if (result.status === "ok" && result.data) {
      displayResultInGrid(result.data);
      status.value = `Done (${result.data.rows?.length ?? 0} rows)`;
    } else if (result.status === "error") {
      status.value = `Error: ${result.error}`;
      // Clear grid on error
      if (gridApi) {
        gridApi.setGridOption("columnDefs", []);
        gridApi.setGridOption("rowData", []);
      }
    }
  } catch (err: any) {
    console.error("[SPL-IDE] Error:", err);
    status.value = `Error: ${err?.message ?? err}`;
  }
}

/**
 * Display query result in AG Grid with column headers
 */
function displayResultInGrid(data: QueryResultData) {
  if (!gridApi) return;

  const { columns, rows } = data;

  // Build column definitions from result columns
  const columnDefs: ColDef[] = columns.map((col) => ({
    field: col,
    headerName: col,
  }));

  // Update AG Grid
  gridApi.setGridOption("columnDefs", columnDefs);
  gridApi.setGridOption("rowData", rows);
}

/**
 * Reset sheet to initial state
 */
function resetSheet() {
  if (!workbook) return;

  const sheet = workbook.getActiveSheet();
  if (!sheet) return;

  // Clear all cells
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 8; c++) {
      const range = sheet.getRange(r, c);
      range?.setValue("");
    }
  }

  // Set initial value in A1
  const a1 = sheet.getRange(0, 0);
  a1?.setValue('demo.query("select * from STATES")');

  // Clear AG Grid
  if (gridApi) {
    gridApi.setGridOption("columnDefs", []);
    gridApi.setGridOption("rowData", []);
  }

  status.value = "Idle";
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <button @click="runSheet">Run Sheet</button>
      <button class="reset-btn" @click="resetSheet">Reset Sheet</button>
      <span class="status">{{ status }}</span>
    </div>

    <div class="section">
      <div class="univer-container" ref="univerContainerRef"></div>
    </div>

    <div class="section result-section">
      <div class="section-title">Query Results (AG Grid)</div>
      <div class="ag-grid-container ag-theme-alpine" ref="agGridContainerRef"></div>
    </div>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar button {
  padding: 8px 16px;
  background: #059669;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.toolbar button:hover {
  background: #047857;
}

.toolbar .reset-btn {
  background: #6b7280;
}

.toolbar .reset-btn:hover {
  background: #4b5563;
}

.status {
  font-size: 12px;
  color: #666;
}

.section {
  display: flex;
  flex-direction: column;
}

.section-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
}

.univer-container {
  height: 250px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.result-section {
  flex: 1;
}

.ag-grid-container {
  height: 300px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
</style>
