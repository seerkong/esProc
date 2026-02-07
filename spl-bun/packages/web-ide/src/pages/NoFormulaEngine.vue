<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import type { FUniver, FWorkbook } from "@univerjs/presets";
import ResultTable from "../components/ResultTable.vue";

import "@univerjs/preset-sheets-core/lib/index.css";

const univerContainerRef = ref<HTMLDivElement>();

const status = ref<string>("Idle");
const resultColumns = ref<string[]>([]);
const resultRows = ref<Record<string, unknown>[]>([]);

let univerAPI: FUniver | null = null;
let workbook: FWorkbook | null = null;

onMounted(() => {
  if (!univerContainerRef.value) return;

  // Create Univer WITHOUT formula calculation.
  const { univerAPI: api } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
    },
    presets: [
      UniverSheetsCorePreset({
        container: univerContainerRef.value,
        formulaBar: false,
      }),
    ],
  });

  univerAPI = api;

  // Values are stored as plain text in this page.
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
            0: { v: "Cell" },
            1: { v: "Expression" },
          },
          1: {
            0: { v: "A2" },
            1: { v: "select * from products" },
          },
          2: {
            0: { v: "A3" },
            1: { v: "select id, name from users where active = 1" },
          },
          3: {
            0: { v: "A4" },
            1: { v: "join(orders, customers, order.cid == customer.id)" },
          },
        },
        rowCount: 20,
        columnCount: 8,
      },
    },
  });

  console.log("[Univer] Created without formula engine processing");
});

onUnmounted(() => {
  univerAPI?.disposeUniver();
});

function collectDataFromSheet(): { headers: string[]; rows: Record<string, unknown>[] } {
  if (!workbook) return { headers: [], rows: [] };

  const sheet = workbook.getActiveSheet();
  if (!sheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];

  // Get headers from first row.
  for (let c = 0; c < 2; c++) {
    const range = sheet.getRange(0, c);
    const val = range?.getValue();
    headers.push(val !== undefined && val !== null ? String(val) : `Col${c + 1}`);
  }

  // Get data rows.
  for (let r = 1; r < 4; r++) {
    const row: Record<string, unknown> = {};
    for (let c = 0; c < 2; c++) {
      const range = sheet.getRange(r, c);
      const val = range?.getValue();
      row[headers[c]] = val;
    }
    rows.push(row);
  }

  return { headers, rows };
}

function runSheet(): void {
  status.value = "Running...";

  try {
    const { headers, rows } = collectDataFromSheet();
    resultColumns.value = headers;
    resultRows.value = rows;
    status.value = "Done";
  } catch (err: unknown) {
    console.error(err);
    status.value = `Error: ${err instanceof Error ? err.message : String(err)}`;
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
      <strong>No Formula Engine:</strong>
      Text is stored as plain values. Type expressions directly without <code>=</code> prefix.
      <br />
      Example: <code>select * from products</code> (not <code>=select * from products</code>)
    </div>

    <div class="section">
      <div class="section-title">Univer Spreadsheet (Plain Text Mode)</div>
      <div class="univer-container" ref="univerContainerRef"></div>
    </div>

    <div class="section result-section">
      <div class="section-title">Result Table</div>
      <ResultTable :columns="resultColumns" :rows="resultRows" />
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
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 4px;
  font-size: 13px;
  color: #92400e;
}

.info code {
  background: #fde68a;
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

.result-section {
  flex: 1;
  min-height: 240px;
}
</style>
