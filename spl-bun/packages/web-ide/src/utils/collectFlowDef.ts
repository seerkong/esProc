export type FlowDefCell = {
  row: number;
  col: string;
  expr: string;
};

export type SheetRangeLike = {
  getValue(): unknown;
};

export type SheetLike = {
  getRange(rowIndex: number, colIndex: number): SheetRangeLike | null | undefined;
};

export type CollectFlowDefOptions = {
  maxRows: number;
  maxCols: number;
};

function colIndexToLabel(colIndex: number): string {
  // Excel-like 0-based index to letters: 0->A, 25->Z, 26->AA ...
  if (!Number.isInteger(colIndex) || colIndex < 0) {
    throw new Error(`Invalid colIndex: ${colIndex}`);
  }
  let n = colIndex;
  let out = "";
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

export function collectFlowDefFromSheet(sheet: SheetLike | null | undefined, opts: CollectFlowDefOptions): FlowDefCell[] {
  const flowDef: FlowDefCell[] = [];
  if (!sheet) return flowDef;

  const maxRows = Math.max(0, opts.maxRows | 0);
  const maxCols = Math.max(0, opts.maxCols | 0);

  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      let val: unknown;
      try {
        val = sheet.getRange(r, c)?.getValue();
      } catch {
        continue;
      }

      if (val === undefined || val === null) continue;
      const text = String(val).trim();
      if (text.length === 0) continue;

      flowDef.push({ row: r + 1, col: colIndexToLabel(c), expr: text });
    }
  }

  return flowDef;
}
