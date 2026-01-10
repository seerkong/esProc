<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import type { FUniver, FWorkbook } from "@univerjs/presets";
import { createGrid, type GridApi, type GridOptions, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import { customFunctions } from "../formulas/custom-formulas";

import "@univerjs/preset-sheets-core/lib/index.css";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
LicenseManager.setLicenseKey("DownloadDevTools_COM_NDEwMjM0NTgwMDAwMA==59158b5225400879a12a96634544f5b6");

const univerContainerRef = ref<HTMLDivElement>();
const agGridContainerRef = ref<HTMLDivElement>();

const status = ref<string>("Idle");
const rowData = shallowRef<Record<string, any>[]>([]);
const columnDefs = shallowRef<{ field: string; headerName: string }[]>([]);

let univerAPI: FUniver | null = null;
let workbook: FWorkbook | null = null;
let gridApi: GridApi | null = null;

onMounted(() => {
  if (!univerContainerRef.value) return;

  const { univerAPI: api } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
    },
    presets: [
      UniverSheetsCorePreset({
        container: univerContainerRef.value,
        formula: {
          function: customFunctions,
        },
      }),
    ],
  });

  univerAPI = api;

  // Create workbook with sample data using custom formulas
  workbook = univerAPI.createWorkbook({
    id: "workbook-01",
    name: "Data Sheet",
    sheetOrder: ["sheet1"],
    sheets: {
      sheet1: {
        id: "sheet1",
        name: "Sheet1",
        cellData: {
          0: {
            0: { v: "DSL Expression" },
            1: { v: "Result Preview" },
          },
          1: {
            0: { f: '=DSL("select * from products")' },
            1: { v: "(Run to see result)" },
          },
          2: {
            0: { f: '=DSL("select id, name from users where active = 1")' },
            1: { v: "(Run to see result)" },
          },
          3: {
            0: { v: "Number" },
            1: { v: "Doubled" },
          },
          4: {
            0: { v: 10.5 },
            1: { f: "=DOUBLE(A5)" },
          },
          5: {
            0: { v: 25 },
            1: { f: "=DOUBLE(A6)" },
          },
        },
        rowCount: 20,
        columnCount: 8,
      },
    },
  });

  console.log("[Univer] Custom formulas registered: DOUBLE, GREET, CUSTOMSUM");

  // Initialize AG Grid
  if (agGridContainerRef.value) {
    const gridOptions: GridOptions = {
      columnDefs: [],
      rowData: [],
      defaultColDef: {
        resizable: true,
        sortable: true,
        flex: 1,
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

function collectDataFromSheet() {
  if (!workbook) return { headers: [] as string[], rows: [] as Record<string, any>[] };

  const sheet = workbook.getActiveSheet();
  if (!sheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  const rows: Record<string, any>[] = [];

  // Get headers from first row
  for (let c = 0; c < 2; c++) {
    const range = sheet.getRange(0, c);
    const val = range?.getValue();
    headers.push(val !== undefined && val !== null ? String(val) : `Col${c + 1}`);
  }

  // Get data rows
  for (let r = 1; r < 6; r++) {
    const row: Record<string, any> = {};
    for (let c = 0; c < 2; c++) {
      const range = sheet.getRange(r, c);
      const val = range?.getValue();
      row[headers[c]] = val;
    }
    rows.push(row);
  }

  return { headers, rows };
}

function runSheet() {
  status.value = "Running...";

  try {
    const { headers, rows } = collectDataFromSheet();

    // Update AG Grid
    columnDefs.value = headers.map((h) => ({ field: h, headerName: h }));
    rowData.value = rows;

    if (gridApi) {
      gridApi.setGridOption("columnDefs", columnDefs.value);
      gridApi.setGridOption("rowData", rowData.value);
    }

    status.value = "Done";
  } catch (err: any) {
    console.error(err);
    status.value = `Error: ${err?.message ?? err}`;
  }
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <button @click="runSheet">Run Sheet</button>
      <span class="status">{{ status }}</span>
    </div>

    <div class="info">
      <strong>Custom Formulas:</strong>
      <code>=DSL("select * from abc")</code> - displays: select * from abc,
      <code>=DOUBLE(value)</code> - doubles a number,
      <code>=GREET(name)</code> - returns greeting
    </div>

    <div class="section">
      <div class="section-title">Univer Spreadsheet (with custom formulas)</div>
      <div class="univer-container" ref="univerContainerRef"></div>
    </div>

    <div class="section">
      <div class="section-title">AG Grid Result</div>
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
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.toolbar button:hover {
  background: #1d4ed8;
}

.status {
  font-size: 12px;
  color: #666;
}

.info {
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  font-size: 13px;
  color: #0369a1;
}

.info code {
  background: #e0f2fe;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
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
  height: 300px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.ag-grid-container {
  height: 200px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
</style>
