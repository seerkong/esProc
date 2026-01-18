import { DataSet } from "@esproc/core";
import type { WindowSpec, JoinSpec } from "@esproc/core";

// ============================================================================
// API Routes
// ============================================================================

export const apiRoutes = {
  runSheet: "/api/run-sheet",
  execute: "/api/execute",
  health: "/api/health",
} as const;

// ============================================================================
// Execute API Types (SPL IDE)
// ============================================================================

/**
 * Request payload for /api/execute
 * Object containing the flow definition
 */
export interface ExecuteExpression {
  row: number;
  col: string;
  expr: string;
}

export interface ExecuteRequest {
  flowDef: ExecuteExpression[];
}

/**
 * Query result data with columns and rows
 */
export interface QueryResultData {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ExecuteCellResult {
  row: number;
  col: string;
  expr: string;
  status: "ok" | "error";
  result?: unknown;
  error?: string;
}

/**
 * Response payload for /api/execute
 */
export type ExecuteResponse =
  | { status: "ok"; data?: QueryResultData; cells: ExecuteCellResult[] }
  | { status: "error"; error: string; cells?: ExecuteCellResult[] };

// Database connection metadata shared across services
export interface DBConnection {
  name: string;
  type: "sqlite" | "jdbc" | string;
  path?: string;
  driver?: string;
  url?: string;
}

// ============================================================================
// Run Sheet API Types (Legacy)
// ============================================================================

export type CellKind = "expression" | "sql" | "filter" | "compute" | "join" | "window";

export interface BaseCell {
  ref: string;
  kind: CellKind;
  expression: string;
  dependencies?: string[];
}

export interface SqlCell extends BaseCell {
  kind: "sql";
  dbPath?: string;
  params?: unknown[];
}

export interface FilterCell extends BaseCell {
  kind: "filter";
  source: string;
}

export interface ComputeCell extends BaseCell {
  kind: "compute";
  source: string;
  columns: Record<string, string>;
}

export interface JoinCell extends BaseCell {
  kind: "join";
  left: string;
  right: string;
  spec: JoinSpec;
}

export interface WindowCell extends BaseCell {
  kind: "window";
  source: string;
  spec: WindowSpec;
}

export type CellDefinition = BaseCell | SqlCell | FilterCell | ComputeCell | JoinCell | WindowCell;

export interface RunSheetRequest {
  cells: CellDefinition[];
}

export interface CellResult {
  ref: string;
  status: "ok" | "error";
  value?: unknown;
  error?: string;
  durationMs: number;
}

export interface RunSheetResponse {
  results: CellResult[];
}

// ============================================================================
// Utility Functions
// ============================================================================

export function mapDataSetSummary(value: unknown): unknown {
  if (value instanceof DataSet) {
    const ds = value as DataSet;
    return { rows: ds.rows, schema: ds.schema };
  }
  return value;
}
