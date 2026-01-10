import { parseCellRef, type SpreadsheetEvaluation, type SpreadsheetModel } from "./sheet";

export interface GridCellDisplay {
  ref: string;
  expression: string;
  value?: unknown;
  status: "ok" | "error" | "pending";
  error?: string;
}

export interface GridConfig {
  columnDefs: { field: string; headerName: string; resizable: boolean; editable: boolean }[];
  rowData: Record<string, unknown>[];
  defaultColDef: { resizable: boolean; editable: boolean };
  rowHeight: number;
}

export interface GridOptions {
  minRows?: number;
  minCols?: number;
}

function toColumnLabel(index: number): string {
  let label = "";
  let num = index;
  while (num > 0) {
    const rem = (num - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    num = Math.floor((num - 1) / 26);
  }
  return label || "A";
}

export function buildGridConfig(sheet: SpreadsheetModel, evaluation?: SpreadsheetEvaluation, options?: GridOptions): GridConfig {
  const cells = sheet.getCells();
  const coords = cells.map((c) => parseCellRef(c.ref));
  const maxRow = Math.max(...coords.map((c) => c.row), options?.minRows ?? 10);
  const maxCol = Math.max(...coords.map((c) => c.col), options?.minCols ?? 5);

  const columnDefs = [
    { field: "row", headerName: "#", resizable: false, editable: false },
    ...Array.from({ length: maxCol }, (_, idx) => {
      const label = toColumnLabel(idx + 1);
      return { field: label, headerName: label, resizable: true, editable: true };
    }),
  ];

  const rowData: Record<string, unknown>[] = [];
  for (let row = 1; row <= maxRow; row++) {
    const rowEntry: Record<string, unknown> = { row };
    columnDefs.slice(1).forEach((col) => {
      const ref = `${col.field}${row}`;
      const cellDef = sheet.getCell(ref);
      const result = evaluation?.results.get(ref);
      const status: GridCellDisplay["status"] = result ? result.status : "pending";
      rowEntry[col.field] = {
        ref,
        expression: cellDef?.expression ?? "",
        value: result?.value,
        status,
        error: result?.error?.message,
      } satisfies GridCellDisplay;
    });
    rowData.push(rowEntry);
  }

  return {
    columnDefs,
    rowData,
    defaultColDef: { resizable: true, editable: true },
    rowHeight: 70,
  };
}
