import type { JoinSpec, WindowSpec } from "@esproc/core";
import { DataSet } from "@esproc/core";
import { WebIdeRuntime } from "./runtime";

export type CellKind = "expression" | "sql" | "filter" | "compute" | "join" | "window" | "dsl";

export interface BaseCellDefinition {
  ref: string;
  expression: string;
  kind: CellKind;
  dependencies?: string[];
}

export interface SqlCellDefinition extends BaseCellDefinition {
  kind: "sql";
  options?: { dbPath?: string; params?: unknown[] };
}

export interface FilterCellDefinition extends BaseCellDefinition {
  kind: "filter";
  source: string;
  scope?: Record<string, unknown>;
}

export interface ComputeCellDefinition extends BaseCellDefinition {
  kind: "compute";
  source: string;
  columns: Record<string, string>;
  scope?: Record<string, unknown>;
}

export interface JoinCellDefinition extends BaseCellDefinition {
  kind: "join";
  left: string;
  right: string;
  spec: JoinSpec;
}

export interface WindowCellDefinition extends BaseCellDefinition {
  kind: "window";
  source: string;
  spec: WindowSpec;
}

export interface ExpressionCellDefinition extends BaseCellDefinition {
  kind: "expression";
  scope?: Record<string, unknown>;
}

export interface DslCellDefinition extends BaseCellDefinition {
  kind: "dsl";
  scope?: Record<string, unknown>;
}

export type CellDefinition =
  | SqlCellDefinition
  | FilterCellDefinition
  | ComputeCellDefinition
  | JoinCellDefinition
  | WindowCellDefinition
  | ExpressionCellDefinition
  | DslCellDefinition;

export interface CellResult {
  ref: string;
  status: "ok" | "error";
  value?: unknown;
  error?: Error;
  durationMs: number;
}

export interface SpreadsheetEvaluation {
  results: Map<string, CellResult>;
  errors: string[];
}

const CELL_REF_REGEX = /([A-Z]+[0-9]+)/g;

export function parseCellRef(ref: string): { col: number; row: number; colLabel: string } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`Invalid cell reference '${ref}'`);
  }
  const [, letters, rowStr] = match;
  let col = 0;
  for (const char of letters) {
    col = col * 26 + (char.charCodeAt(0) - 64);
  }
  return { col, row: Number(rowStr), colLabel: letters };
}

function detectRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(CELL_REF_REGEX)) {
    refs.add(match[1]);
  }
  return [...refs];
}

export class SpreadsheetModel {
  private cells = new Map<string, CellDefinition>();
  private runtime: WebIdeRuntime;

  constructor(runtime: WebIdeRuntime, initial?: CellDefinition[]) {
    this.runtime = runtime;
    initial?.forEach((cell) => this.upsertCell(cell));
  }

  upsertCell(cell: CellDefinition): void {
    this.cells.set(cell.ref, cell);
  }

  getCell(ref: string): CellDefinition | undefined {
    return this.cells.get(ref);
  }

  getCells(): CellDefinition[] {
    return [...this.cells.values()];
  }

  private dependenciesOf(cell: CellDefinition): string[] {
    const deps = new Set<string>(cell.dependencies ?? []);
    switch (cell.kind) {
      case "filter":
        deps.add(cell.source);
        break;
      case "compute":
        deps.add(cell.source);
        break;
      case "join":
        deps.add(cell.left);
        deps.add(cell.right);
        break;
      case "window":
        deps.add(cell.source);
        break;
      default:
        break;
    }
    detectRefs(cell.expression).forEach((ref) => deps.add(ref));
    return [...deps];
  }

  async evaluate(): Promise<SpreadsheetEvaluation> {
    const results = new Map<string, CellResult>();
    const errors: string[] = [];
    const visiting = new Set<string>();

    const evalCell = async (ref: string): Promise<CellResult> => {
      if (results.has(ref)) {
        return results.get(ref)!;
      }
      if (visiting.has(ref)) {
        const cycleError = new Error(`Cycle detected at ${ref}`);
        const result: CellResult = { ref, status: "error", error: cycleError, durationMs: 0 };
        results.set(ref, result);
        errors.push(cycleError.message);
        return result;
      }
      const cell = this.cells.get(ref);
      if (!cell) {
        const missing = new Error(`Missing cell ${ref}`);
        const result: CellResult = { ref, status: "error", error: missing, durationMs: 0 };
        results.set(ref, result);
        errors.push(missing.message);
        return result;
      }

      visiting.add(ref);
      const deps = this.dependenciesOf(cell);
      for (const dep of deps) {
        await evalCell(dep);
      }
      visiting.delete(ref);

      const start = this.runtime.support.now?.().getTime() ?? Date.now();
      try {
        const value = await this.evaluateCell(cell, results);
        const durationMs = (this.runtime.support.now?.().getTime() ?? Date.now()) - start;
        const ok: CellResult = { ref, status: "ok", value, durationMs };
        results.set(ref, ok);
        this.runtime.innerCtx.lastEvaluated?.set(ref, value);
        return ok;
      } catch (err) {
        const durationMs = (this.runtime.support.now?.().getTime() ?? Date.now()) - start;
        const error = err instanceof Error ? err : new Error(String(err));
        this.runtime.errorCtx.lastError = error;
        const fail: CellResult = { ref, status: "error", error, durationMs };
        results.set(ref, fail);
        errors.push(error.message);
        return fail;
      }
    };

    for (const ref of this.cells.keys()) {
      await evalCell(ref);
    }

    return { results, errors };
  }

  private async evaluateCell(cell: CellDefinition, results: Map<string, CellResult>): Promise<unknown> {
    const depValues: Record<string, unknown> = {};
    for (const dep of this.dependenciesOf(cell)) {
      depValues[dep] = results.get(dep)?.value;
    }

    switch (cell.kind) {
      case "sql": {
        const dbPath = cell.options?.dbPath ?? this.runtime.options.defaultDbPath;
        if (!dbPath) {
          throw new Error(`No dbPath provided for SQL cell ${cell.ref}`);
        }
        const query = this.runtime.adapters.sqliteQuery;
        if (!query) {
          throw new Error("No sqliteQuery adapter provided to web-ide runtime");
        }
        return await query({ dbPath, sql: cell.expression, params: cell.options?.params });
      }
      case "filter": {
        const source = results.get(cell.source)?.value;
        if (!(source instanceof DataSet)) {
          throw new Error(`Cell ${cell.ref} expected DataSet from ${cell.source}`);
        }
        return source.filterExpr(cell.expression, { ...(cell.scope ?? {}), ...depValues });
      }
      case "compute": {
        const source = results.get(cell.source)?.value;
        if (!(source instanceof DataSet)) {
          throw new Error(`Cell ${cell.ref} expected DataSet from ${cell.source}`);
        }
        return source.withComputedColumns(cell.columns, { ...(cell.scope ?? {}), ...depValues });
      }
      case "join": {
        const left = results.get(cell.left)?.value;
        const right = results.get(cell.right)?.value;
        if (!(left instanceof DataSet) || !(right instanceof DataSet)) {
          throw new Error(`Cell ${cell.ref} expected DataSet inputs for join`);
        }
        return left.join(right, cell.spec);
      }
      case "window": {
        const source = results.get(cell.source)?.value;
        if (!(source instanceof DataSet)) {
          throw new Error(`Cell ${cell.ref} expected DataSet from ${cell.source}`);
        }
        return source.window(cell.spec);
      }
      case "dsl": {
        const compiled = this.runtime.compileDsl(cell.expression);
        return compiled.evaluate(this.runtime.toDslContext({ ...(cell.scope ?? {}), ...depValues }, depValues));
      }
      case "expression":
      default: {
        const compiled = this.runtime.expressions.compile(cell.expression);
        return compiled.evaluate({ ...(cell.scope ?? {}), ...depValues });
      }
    }
  }
}
