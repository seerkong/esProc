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
    description: "A1 query only",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select * from STATES")' },
    ],
  },
  {
    id: "states-max-pop",
    label: "Largest state population",
    description: "A1 query, A2 max population, A3 lookup",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select NAME, POPULATION from STATES order by POPULATION desc limit 10")' },
      { row: 2, col: "A", expr: 'A1.first().field("POPULATION")' },
      { row: 3, col: "A", expr: 'demo.query("select NAME, POPULATION from STATES where POPULATION = ?", A2)' },
    ],
  },
  {
    id: "region-drilldown",
    label: "Region drilldown",
    description: "A1 query, A2 region id, A3 region filter",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select NAME, REGIONID, POPULATION from STATES order by POPULATION desc limit 20")' },
      { row: 2, col: "A", expr: 'A1.first().field("REGIONID")' },
      { row: 3, col: "A", expr: 'demo.query("select NAME, POPULATION from STATES where REGIONID = ? order by POPULATION desc limit 10", A2)' },
    ],
  },
  {
    id: "area-children",
    label: "Area children",
    description: "A1 root areas, A2 pick parent, A3 children",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select AREAID, AREANAME, FATHER from AREA where FATHER = 0 order by AREAID")' },
      { row: 2, col: "A", expr: 'A1.first().field("AREAID")' },
      { row: 3, col: "A", expr: 'demo.query("select AREAID, AREANAME from AREA where FATHER = ? order by AREAID", A2)' },
    ],
  },
  {
    id: "crud-demo",
    label: "CRUD sandbox",
    description: "Create/update/delete then query",
    cells: [
      { row: 1, col: "A", expr: 'demo.execute("drop table if exists DEMO_TMP")' },
      { row: 2, col: "A", expr: 'demo.execute("create table DEMO_TMP (id int, name varchar(30), region int)")' },
      { row: 3, col: "A", expr: 'demo.execute("insert into DEMO_TMP values (1, \'North\', 1), (2, \'South\', 2), (3, \'West\', 3)")' },
      { row: 4, col: "A", expr: 'demo.execute("update DEMO_TMP set name = \'North-East\' where id = 1")' },
      { row: 5, col: "A", expr: 'demo.execute("delete from DEMO_TMP where id = 2")' },
      { row: 6, col: "A", expr: 'demo.query("select * from DEMO_TMP order by id")' },
    ],
  },
  {
    id: "sequence-select",
    label: "Sequence Select",
    description: "A1 loads states; A2 filters POPULATION > 5,000,000 with select()",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select NAME, POPULATION, REGIONID from STATES")' },
      { row: 2, col: "A", expr: 'A1.select("POPULATION > 5000000")' },
    ],
  },
  {
    id: "sequence-sort",
    label: "Sequence Sort",
    description: "A1 loads states; A2 sorts by POPULATION desc with sort()",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select NAME, POPULATION from STATES")' },
      { row: 2, col: "A", expr: 'A1.sort("POPULATION", "desc")' },
    ],
  },
  {
    id: "data-pipeline",
    label: "Data Pipeline",
    description: "Filter orders, compute totals, sort, group by customer, then join customer details",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select ORDER_ID, CUSTOMER_ID, PRODUCT_ID, QUANTITY, ORDER_DATE from ORDERS")' },
      { row: 2, col: "A", expr: 'A1.select("QUANTITY >= 3")' },
      { row: 3, col: "A", expr: 'A2.derive({ TOTAL: "PRODUCT_ID * QUANTITY" })' },
      { row: 4, col: "A", expr: 'A3.sort("TOTAL", "desc")' },
      { row: 5, col: "A", expr: 'A4.group({ groupBy: ["CUSTOMER_ID"], aggregates: { orderCount: { type: "count" }, totalAmount: { type: "sum", field: "TOTAL" } } })' },
      { row: 6, col: "A", expr: 'demo.query("select CUSTOMER_ID, NAME, REGION_ID from CUSTOMERS")' },
      { row: 7, col: "A", expr: 'A5.join(A6, { type: "left", leftKeys: ["CUSTOMER_ID"], rightKeys: ["CUSTOMER_ID"], rightPrefix: "cust_" })' },
    ],
  },
  {
    id: "csv-import",
    label: "CSV Import",
    description: "Query sales.csv via sales datasource, sort by amount, and filter to North region",
    cells: [
      { row: 1, col: "A", expr: 'sales.query("select id, product, amount, date, region from csv_data order by amount desc")' },
      { row: 2, col: "A", expr: 'A1.select("region == \"North\"")' },
    ],
  },
  {
    id: "json-processing",
    label: "JSON Processing",
    description: "Load users.json, parse profile JSON, filter gold tier users, and derive labels",
    cells: [
      { row: 1, col: "A", expr: 'users.query("select id, name, region, profile from json_data")' },
      { row: 2, col: "A", expr: 'A1.derive({ profile_obj: "json_parse(profile)" })' },
      { row: 3, col: "A", expr: 'A2.select("profile_obj != null && profile_obj.tier == \\\"gold\\\"")' },
      { row: 4, col: "A", expr: 'A3.derive({ label: "name + \\\"::\\\" + profile_obj.tier", age: "profile_obj.age" })' },
    ],
  },
  {
    id: "data-integration",
    label: "Data Integration",
    description: "Join sales CSV with user regions from JSON",
    cells: [
      { row: 1, col: "A", expr: 'sales.query("select id, product, amount, region from csv_data")' },
      { row: 2, col: "A", expr: 'users.query("select id, name, region from json_data")' },
      { row: 3, col: "A", expr: 'A1.join(A2, { type: "left", leftKeys: ["region"], rightKeys: ["region"], rightPrefix: "user_" })' },
    ],
  },
  {
    id: "cursor-pagination",
    label: "Cursor Pagination",
    description: "Load orders into a sequence, then fetch and skip slices",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select ORDER_ID, CUSTOMER_ID, PRODUCT_ID, QUANTITY, ORDER_DATE from ORDERS order by ORDER_ID")' },
      { row: 2, col: "A", expr: 'A1.fetch(10)' },
      { row: 3, col: "A", expr: 'A1.skip(10)' },
      { row: 4, col: "A", expr: 'A1.fetch(10)' },
    ],
  },
  {
    id: "multi-source-query",
    label: "Multi-Source Query",
    description: "Load SQLite orders plus CSV sales and JSON users in one sheet",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select ORDER_ID, CUSTOMER_ID, QUANTITY from ORDERS order by ORDER_ID limit 5")' },
      { row: 2, col: "A", expr: 'sales.query("select id, product, amount, region from csv_data order by id limit 5")' },
      { row: 3, col: "A", expr: 'users.query("select id, name, region from json_data order by id limit 5")' },
    ],
  },
  {
    id: "cross-datasource-join",
    label: "Cross-Datasource Join",
    description: "Join orders from SQLite with product details from CSV",
    cells: [
      { row: 1, col: "A", expr: 'demo.query("select ORDER_ID, PRODUCT_ID, CUSTOMER_ID, QUANTITY from ORDERS")' },
      { row: 2, col: "A", expr: 'products.query("select id, name, category, price from csv_data")' },
      { row: 3, col: "A", expr: 'A1.join(A2, { type: "left", leftKeys: ["PRODUCT_ID"], rightKeys: ["id"], rightPrefix: "prod_" })' },
    ],
  },
];

const status = ref<string>("Idle");
const selectedDemoId = ref<string>(demos[0].id);

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
  const flowDef: ExecuteRequest["flowDef"] = [];
  if (!workbook) return { flowDef };

  const sheet = workbook.getActiveSheet();
  if (!sheet) return { flowDef };

  // Scan column A (column index 0) for non-empty cells
  for (let r = 0; r < 20; r++) {
    const range = sheet.getRange(r, 0);
    const val = range?.getValue();

    if (val !== undefined && val !== null && val !== "") {
      flowDef.push({ row: r + 1, col: "A", expr: String(val) });
    }
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
