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

type DemoCell = {
  row: number;
  col: string;
  expr: string;
};

const CELL_COL_A_CODE = "A".charCodeAt(0);

type Demo = {
  id: string;
  label: string;
  description: string;
  cells: DemoCell[];
};

const demos: Demo[] = [
  {
    id: "states-base",
    label: "US States (A1)",
    description: "A1 connect, A2 query",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select * from STATES")' },
    ],
  },
  {
    id: "states-max-pop",
    label: "Largest state population",
    description: "A1 connect, A2 query, A3 max population, A4 lookup",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select NAME, POPULATION from STATES order by POPULATION desc limit 10")' },
      { row: 3, col: "A", expr: 'A2.first().field("POPULATION")' },
      { row: 4, col: "A", expr: 'db.query("select NAME, POPULATION from STATES where POPULATION = ?", A3)' },
    ],
  },
  {
    id: "region-drilldown",
    label: "Region drilldown",
    description: "A1 connect, A2 query, A3 region id, A4 region filter",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select NAME, REGIONID, POPULATION from STATES order by POPULATION desc limit 20")' },
      { row: 3, col: "A", expr: 'A2.first().field("REGIONID")' },
      { row: 4, col: "A", expr: 'db.query("select NAME, POPULATION from STATES where REGIONID = ? order by POPULATION desc limit 10", A3)' },
    ],
  },
  {
    id: "area-children",
    label: "Area children",
    description: "A1 connect, A2 root areas, A3 pick parent, A4 children",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select AREAID, AREANAME, FATHER from AREA where FATHER = 0 order by AREAID")' },
      { row: 3, col: "A", expr: 'A2.first().field("AREAID")' },
      { row: 4, col: "A", expr: 'db.query("select AREAID, AREANAME from AREA where FATHER = ? order by AREAID", A3)' },
    ],
  },
  {
    id: "crud-demo",
    label: "CRUD sandbox",
    description: "A1 connect, A2-A6 mutate, A7 query",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.execute("drop table if exists DEMO_TMP")' },
      { row: 3, col: "A", expr: 'db.execute("create table DEMO_TMP (id int, name varchar(30), region int)")' },
      { row: 4, col: "A", expr: 'db.execute("insert into DEMO_TMP values (1, \'North\', 1), (2, \'South\', 2), (3, \'West\', 3)")' },
      { row: 5, col: "A", expr: 'db.execute("update DEMO_TMP set name = \'North-East\' where id = 1")' },
      { row: 6, col: "A", expr: 'db.execute("delete from DEMO_TMP where id = 2")' },
      { row: 7, col: "A", expr: 'db.query("select * from DEMO_TMP order by id")' },
    ],
  },
  {
    id: "sequence-select",
    label: "Sequence Select",
    description: "A1 connect, A2 loads states; A3 filters POPULATION > 5,000,000 with select()",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select NAME, POPULATION, REGIONID from STATES")' },
      { row: 3, col: "A", expr: 'A2.select("POPULATION > 5000000")' },
    ],
  },
  {
    id: "sequence-sort",
    label: "Sequence Sort",
    description: "A1 connect, A2 loads states; A3 sorts by POPULATION desc with sort()",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select NAME, POPULATION from STATES")' },
      { row: 3, col: "A", expr: 'A2.sort("POPULATION", "desc")' },
    ],
  },
  {
    id: "data-pipeline",
    label: "Data Pipeline",
    description: "A1 connect, A2-A6 transform orders, A7 load customers, A8 join",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select ORDER_ID, CUSTOMER_ID, PRODUCT_ID, QUANTITY, ORDER_DATE from ORDERS")' },
      { row: 3, col: "A", expr: 'A2.select("QUANTITY >= 3")' },
      { row: 4, col: "A", expr: 'A3.derive({ TOTAL: "PRODUCT_ID * QUANTITY" })' },
      { row: 5, col: "A", expr: 'A4.sort("TOTAL", "desc")' },
      { row: 6, col: "A", expr: 'A5.group({ groupBy: ["CUSTOMER_ID"], aggregates: { orderCount: { type: "count" }, totalAmount: { type: "sum", field: "TOTAL" } } })' },
      { row: 7, col: "A", expr: 'db.query("select CUSTOMER_ID, NAME, REGION_ID from CUSTOMERS")' },
      { row: 8, col: "A", expr: 'A6.join(A7, { type: "left", leftKeys: ["CUSTOMER_ID"], rightKeys: ["CUSTOMER_ID"], rightPrefix: "cust_" })' },
    ],
  },
  {
    id: "csv-import",
    label: "CSV Import",
    description: "A1 load sales.csv (T), A2 sort by amount, A3 filter North",
    cells: [
      { row: 1, col: "A", expr: 'sales = T("./data/sales.csv")' },
      { row: 2, col: "A", expr: 'sales.sort("amount", "desc")' },
      { row: 3, col: "A", expr: 'A2.select("region == \\\"North\\\"")' },
    ],
  },
  {
    id: "json-processing",
    label: "JSON Processing",
    description: "A1 load users.json (T), A2 parse profile, A3 filter gold, A4 derive",
    cells: [
      { row: 1, col: "A", expr: 'users = T("./data/users.json")' },
      { row: 2, col: "A", expr: 'A1.derive({ profile_obj: "json_parse(profile)" })' },
      { row: 3, col: "A", expr: 'A2.select("profile_obj != null && profile_obj.tier == \\\"gold\\\"")' },
      { row: 4, col: "A", expr: 'A3.derive({ label: "name + \\\"::\\\" + profile_obj.tier", age: "profile_obj.age" })' },
    ],
  },
  {
    id: "excel-roundtrip",
    label: "Excel Roundtrip",
    description: "A1 make rows, A2 export xlsx, A3 import xlsx, A4 export xls, A5 import xls",
    cells: [
      { row: 1, col: "A", expr: 'data = [{ Name: "Alice", Class: "A", Score: 98 }, { Name: "Bob", Class: "B", Score: 85 }]' },
      { row: 2, col: "A", expr: 'T("./data/out/scores.xlsx", data; "School1")' },
      { row: 3, col: "A", expr: 'T("./data/out/scores.xlsx"; "School1")' },
      { row: 4, col: "A", expr: 'T("./data/out/scores.xls", data; "School1")' },
      { row: 5, col: "A", expr: 'T("./data/out/scores.xls"; "School1")' },
    ],
  },
  {
    id: "data-integration",
    label: "Data Integration",
    description: "A1 load sales.csv (T), A2 load users.json (T), A3 join on region",
    cells: [
      { row: 1, col: "A", expr: 'sales = T("./data/sales.csv")' },
      { row: 2, col: "A", expr: 'users = T("./data/users.json")' },
      { row: 3, col: "A", expr: 'A1.join(A2, { type: "left", leftKeys: ["region"], rightKeys: ["region"], rightPrefix: "user_" })' },
    ],
  },
  {
    id: "cursor-pagination",
    label: "Cursor Pagination",
    description: "A1 connect, A2 load orders; A3 fetch, A4 skip, A5 fetch",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select ORDER_ID, CUSTOMER_ID, PRODUCT_ID, QUANTITY, ORDER_DATE from ORDERS order by ORDER_ID")' },
      { row: 3, col: "A", expr: 'A2.fetch(10)' },
      { row: 4, col: "A", expr: 'A2.skip(10)' },
      { row: 5, col: "A", expr: 'A2.fetch(10)' },
    ],
  },
  {
    id: "multi-source-query",
    label: "Multi-Source Query",
    description: "A1 connect, A2 orders query; A3 load sales.csv (T); A4 load users.json (T)",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select ORDER_ID, CUSTOMER_ID, QUANTITY from ORDERS order by ORDER_ID limit 5")' },
      { row: 3, col: "A", expr: 'T("./data/sales.csv")' },
      { row: 4, col: "A", expr: 'T("./data/users.json")' },
    ],
  },
  {
    id: "cross-datasource-join",
    label: "Cross-Datasource Join",
    description: "A1 connect, A2 orders query, A3 load products.csv (T), A4 join",
    cells: [
      { row: 1, col: "A", expr: 'db = connect("demo")' },
      { row: 2, col: "A", expr: 'db.query("select ORDER_ID, PRODUCT_ID, CUSTOMER_ID, QUANTITY from ORDERS")' },
      { row: 3, col: "A", expr: 'products = T("./data/products.csv")' },
      { row: 4, col: "A", expr: 'A2.join(A3, { type: "left", leftKeys: ["PRODUCT_ID"], rightKeys: ["id"], rightPrefix: "prod_" })' },
    ],
  },
];

const status = ref<string>("Idle");
const selectedDemoId = ref<string>(demos[0].id);

let univerAPI: FUniver | null = null;
let workbook: FWorkbook | null = null;
let gridApi: GridApi | null = null;

declare global {
  interface Window {
    __SPL_UNIVER__?: {
      workbook: FWorkbook;
    };
  }
}


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
            0: { v: 'db = connect("demo")' },
          },
          1: {
            0: { v: 'db.query("select * from STATES")' },
          },
        },
        rowCount: 20,
        columnCount: 8,
      },
    },
  });

  if (workbook && import.meta.env.DEV) {
    window.__SPL_UNIVER__ = { workbook };
  }

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
  const flowDef: ExecuteRequest["flowDef"] = [];
  if (!workbook) return { flowDef };

  const sheet = workbook.getActiveSheet();
  if (!sheet) return { flowDef };

  const maxRows = sheet.getMaxRows();
  const colIndex = 0;

  for (let r = 0; r < maxRows; r++) {
    let val: unknown;
    try {
      val = sheet.getRange(r, colIndex)?.getValue();
    } catch {
      continue;
    }

    if (val === undefined || val === null) continue;
    const text = String(val).trim();
    if (text.length === 0) continue;

    flowDef.push({ row: r + 1, col: "A", expr: text });
  }

  return { flowDef };
}

/**
 * Run sheet: collect expressions from column A, send to backend, display results
 */
async function runSheet() {
  status.value = "Running...";

  try {
    const payload: ExecuteRequest = collectColumnA();

    if (payload.flowDef.length === 0) {
      status.value = "No expressions to evaluate";
      return;
    }

    console.log("[SPL-IDE] Sending expressions to backend:", payload);

    // Send expressions to backend using shared API routes
    const response = await fetch(`${API_BASE_URL}${apiRoutes.execute}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

  // Set initial value in A1/A2
  const a1 = sheet.getRange(0, 0);
  a1?.setValue('db = connect("demo")');
  const a2 = sheet.getRange(1, 0);
  a2?.setValue('db.query("select * from STATES")');

  // Clear AG Grid
  if (gridApi) {
    gridApi.setGridOption("columnDefs", []);
    gridApi.setGridOption("rowData", []);
  }

  status.value = "Idle";
}

function loadDemo() {
  if (!workbook) return;

  const sheet = workbook.getActiveSheet();
  if (!sheet) return;

  // Clear 20x8 grid similar to resetSheet
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 8; c++) {
      sheet.getRange(r, c)?.setValue("");
    }
  }

  const demo = demos.find((d) => d.id === selectedDemoId.value);
  if (!demo) return;

  // Write demo cells into sheet
  demo.cells.forEach((cell) => {
    const rowIndex = cell.row - 1;
    const colIndex = cell.col.toUpperCase().charCodeAt(0) - CELL_COL_A_CODE;
    if (rowIndex >= 0 && colIndex >= 0) {
      sheet.getRange(rowIndex, colIndex)?.setValue(cell.expr);
    }
  });

  // Clear AG Grid view when loading a demo
  if (gridApi) {
    gridApi.setGridOption("columnDefs", []);
    gridApi.setGridOption("rowData", []);
  }

  status.value = `Loaded: ${demo.label}`;
}

</script>

<template>
  <div class="page">
    <div class="toolbar">
      <button @click="runSheet">Run Sheet</button>
      <button class="reset-btn" @click="resetSheet">Reset Sheet</button>
      <div class="demo-controls">
        <label for="demoSelect">Load Demo</label>
        <select id="demoSelect" v-model="selectedDemoId" @change="loadDemo">
          <option v-for="demo in demos" :key="demo.id" :value="demo.id">
            {{ demo.label }} - {{ demo.description }}
          </option>
        </select>
        <button class="load-btn" @click="loadDemo">Load Demo</button>
      </div>
      <span class="status">{{ status }}</span>
    </div>


    <div class="section">
      <div class="univer-container" ref="univerContainerRef"></div>
    </div>

    <div class="section result-section">
      <div class="section-title">Query Results</div>
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
  flex-wrap: wrap;
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

.demo-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 6px 10px;
  border-radius: 6px;
}

.demo-controls select {
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: white;
  font-size: 14px;
}

.demo-controls .load-btn {
  background: #1f2937;
  padding: 6px 12px;
}

.demo-controls .load-btn:hover {
  background: #111827;
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
