import { compileExpression, truthy } from "@esproc/expression";
import { AvgGather, CountGather, SumGather, runGather, type GatherFunction } from "./gather";

export type Value = unknown;
export type Row = Record<string, Value>;

export interface ColumnSchema {
  name: string;
  type: string;
}

export interface AggregateSpec {
  groupBy?: string[];
  aggregates: Record<string, (rows: Row[]) => Value>;
}

export type GatherSpec = {
  [name: string]: { type: "sum" | "count" | "avg"; field?: string };
};


export type JoinType = "inner" | "left";

export interface JoinSpec {
  type: JoinType;
  leftKeys: string[];
  rightKeys?: string[];
  rightPrefix?: string;
  leftKeyExprs?: string[];
  rightKeyExprs?: string[];
}

export type SortDirection = "asc" | "desc";

export interface OrderBySpec {
  column: string;
  direction?: SortDirection;
}

export interface WindowOutputs {
  rowNumber?: string;
  rank?: string;
  denseRank?: string;
  runningSum?: { column: string; as?: string; expression?: string };
  runningAvg?: { column: string; as?: string; expression?: string };
}

export interface WindowSpec {
  partitionBy?: string[];
  orderBy: OrderBySpec[];
  outputs: WindowOutputs;
}

export class DataSet {
  readonly schema: ColumnSchema[];
  readonly rows: Row[];

  constructor(schema: ColumnSchema[], rows: Row[]) {
    this.schema = schema;
    this.rows = rows;
  }

  static fromRows(rows: Row[]): DataSet {
    const schema = inferSchema(rows);
    return new DataSet(schema, rows);
  }

  project(columns: string[]): DataSet {
    const columnSet = new Set(columns);
    const schema = this.schema.filter((c) => columnSet.has(c.name));
    const rows = this.rows.map((row) => {
      const projected: Row = {};
      for (const col of columns) {
        projected[col] = row[col];
      }
      return projected;
    });
    return new DataSet(schema, rows);
  }

  filter(predicate: (row: Row) => boolean): DataSet {
    const rows = this.rows.filter(predicate);
    return new DataSet(this.schema, rows);
  }

  filterExpr(expression: string, scope: Record<string, unknown> = {}): DataSet {
    const compiled = compileExpression(expression);
    return this.filter((row) => truthy(compiled.evaluate({ ...scope, ...row })));
  }

  withComputedColumns(columns: Record<string, string>, scope: Record<string, unknown> = {}): DataSet {
    const compiled = Object.fromEntries(
      Object.entries(columns).map(([name, expr]) => [name, compileExpression(expr)]),
    );
    const rows = this.rows.map((row) => {
      const next: Row = { ...row };
      for (const [name, evaluator] of Object.entries(compiled)) {
        next[name] = evaluator.evaluate({ ...scope, ...row });
      }
      return next;
    });
    const newSchema = [...this.schema];
    for (const col of Object.keys(columns)) {
      if (!newSchema.find((c) => c.name === col)) {
        newSchema.push({ name: col, type: "unknown" });
      }
    }
    return new DataSet(newSchema, rows);
  }

  aggregate(spec: AggregateSpec): DataSet {
    const groupKeys = spec.groupBy ?? [];
    const groups = new Map<string, Row[]>();

    for (const row of this.rows) {
      const key = groupKeys.map((k) => String(row[k])).join("|");
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    const resultRows: Row[] = [];
    for (const [key, rows] of groups.entries()) {
      const groupRow: Row = {};
      if (groupKeys.length > 0) {
        const keyParts = key.split("|");
        groupKeys.forEach((k, idx) => {
          groupRow[k] = keyParts[idx];
        });
      }
      for (const [alias, fn] of Object.entries(spec.aggregates)) {
        groupRow[alias] = fn(rows);
      }
      resultRows.push(groupRow);
    }

    const schema: ColumnSchema[] = [
      ...groupKeys.map((name) => ({ name, type: "string" })),
      ...Object.keys(spec.aggregates).map((name) => ({ name, type: "number" })),
    ];

    return new DataSet(schema, resultRows);
  }

  aggregateWithGather(spec: GatherSpec): DataSet {
    const rows = [
      Object.fromEntries(
        Object.entries(spec).map(([name, cfg]) => {
          const gather = createGather(cfg);
          return [name, runGather(gather, this.rows)];
        }),
      ),
    ];
    const schema: ColumnSchema[] = Object.keys(spec).map((name) => ({ name, type: "number" }));
    return new DataSet(schema, rows);
  }


  join(other: DataSet, spec: JoinSpec): DataSet {
    const rightKeys = spec.rightKeys ?? spec.leftKeys;
    if (spec.leftKeys.length !== rightKeys.length) {
      throw new Error("Join key lengths must match");
    }
    const rightPrefix = spec.rightPrefix ?? "right_";
    const rightKeyed = new Map<string, Row[]>();
    const leftEvaluators = (spec.leftKeyExprs ?? []).map((expr) => compileExpression(expr));
    const rightEvaluators = (spec.rightKeyExprs ?? []).map((expr) => compileExpression(expr));
    const makeKey = (row: Row, keys: string[], evaluators: ReturnType<typeof compileExpression>[]) => {
      if (evaluators.length > 0) {
        return evaluators.map((ev) => stringifyKey(ev.evaluate(row))).join("\u0001");
      }
      return keys.map((k) => stringifyKey(row[k])).join("\u0001");
    };

    for (const row of other.rows) {
      const key = makeKey(row, rightKeys, rightEvaluators);
      const arr = rightKeyed.get(key) ?? [];
      arr.push(row);
      rightKeyed.set(key, arr);
    }

    const mergedRows: Row[] = [];
    for (const leftRow of this.rows) {
      const key = makeKey(leftRow, spec.leftKeys, leftEvaluators);
      const matches = rightKeyed.get(key);
      if (matches && matches.length > 0) {
        for (const rightRow of matches) {
          mergedRows.push(mergeRows(leftRow, rightRow, rightPrefix, other.schema));
        }
      } else if (spec.type === "left") {
        mergedRows.push(mergeRows(leftRow, undefined, rightPrefix, other.schema));
      }
    }

    const mergedSchema = mergeSchema(this.schema, other.schema, rightPrefix);
    return new DataSet(mergedSchema, mergedRows);
  }

  window(spec: WindowSpec): DataSet {
    if (!spec.orderBy || spec.orderBy.length === 0) {
      throw new Error("Window operations require orderBy");
    }

    const partitions = new Map<string, Row[]>();
    const partitionBy = spec.partitionBy ?? [];
    const makePartitionKey = (row: Row) => partitionBy.map((k) => stringifyKey(row[k])).join("\u0001");

    for (const row of this.rows) {
      const key = makePartitionKey(row);
      const arr = partitions.get(key) ?? [];
      arr.push(row);
      partitions.set(key, arr);
    }

    const outputRows: Row[] = [];
    for (const [_key, rows] of partitions.entries()) {
      const sorted = [...rows].sort((a, b) => compareRows(a, b, spec.orderBy));
      let runningSum = 0;
      let count = 0;
      let rank = 0;
      let denseRank = 0;

      const sumColumn = spec.outputs.runningSum?.column;
      const avgColumn = spec.outputs.runningAvg?.column;
      const sumEvaluator = spec.outputs.runningSum?.expression
        ? compileExpression(spec.outputs.runningSum.expression)
        : undefined;
      const avgEvaluator = spec.outputs.runningAvg?.expression
        ? compileExpression(spec.outputs.runningAvg.expression)
        : undefined;

      sorted.forEach((row, idx) => {
        const rowCopy: Row = { ...row };
        if (spec.outputs.rowNumber !== undefined) {
          rowCopy[spec.outputs.rowNumber || "row_number"] = idx + 1;
        }

        const cmpWithPrev = idx === 0 ? -1 : compareRows(row, sorted[idx - 1], spec.orderBy);
        if (idx === 0) {
          rank = 1;
          denseRank = 1;
        } else if (cmpWithPrev !== 0) {
          denseRank += 1;
          rank = idx + 1;
        }

        if (spec.outputs.rank !== undefined) {
          rowCopy[spec.outputs.rank || "rank"] = rank;
        }
        if (spec.outputs.denseRank !== undefined) {
          rowCopy[spec.outputs.denseRank || "dense_rank"] = denseRank;
        }

        if (sumColumn) {
          const source = sumEvaluator ? sumEvaluator.evaluate(row) : row[sumColumn];
          const val = Number(source);
          if (Number.isNaN(val)) {
            throw new Error(`Non-numeric value for running_sum in column '${sumColumn}'`);
          }
          runningSum += val;
          rowCopy[spec.outputs.runningSum?.as || `running_sum_${sumColumn}`] = runningSum;
        }

        if (avgColumn) {
          const source = avgEvaluator ? avgEvaluator.evaluate(row) : row[avgColumn];
          const val = Number(source);
          if (Number.isNaN(val)) {
            throw new Error(`Non-numeric value for running_avg in column '${avgColumn}'`);
          }
          if (!sumColumn) {
            runningSum += val;
          }
          count += 1;
          const sumForAvg = sumColumn
            ? (rowCopy[spec.outputs.runningSum?.as || `running_sum_${sumColumn}`] as number)
            : runningSum;
          rowCopy[spec.outputs.runningAvg?.as || `running_avg_${avgColumn}`] = sumForAvg / count;
        }

        outputRows.push(rowCopy);
      });
    }

    const newSchema = buildWindowSchema(this.schema, spec.outputs);
    return new DataSet(newSchema, outputRows);
  }

  toArray(): Row[] {
    return [...this.rows];
  }
}

function createGather(cfg: { type: "sum" | "count" | "avg"; field?: string }): GatherFunction {
  switch (cfg.type) {
    case "sum":
      return new SumGather(cfg.field);
    case "count":
      return new CountGather();
    case "avg":
      return new AvgGather(cfg.field);
    default:
      throw new Error(`Unknown gather type: ${cfg.type}`);
  }
}


function inferSchema(rows: Row[]): ColumnSchema[] {
  if (rows.length === 0) {
    return [];
  }
  const sample = rows[0];
  return Object.keys(sample).map((name) => ({ name, type: typeof sample[name] }));
}

function mergeRows(left: Row, right: Row | undefined, rightPrefix: string, rightSchema?: ColumnSchema[]): Row {
  const merged: Row = { ...left };
  if (!right) {
    if (rightSchema) {
      for (const col of rightSchema) {
        const targetName = Object.prototype.hasOwnProperty.call(merged, col.name) ? `${rightPrefix}${col.name}` : col.name;
        if (!Object.prototype.hasOwnProperty.call(merged, targetName)) {
          merged[targetName] = undefined;
        }
      }
    }
    return merged;
  }
  for (const [key, value] of Object.entries(right)) {
    if (Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[`${rightPrefix}${key}`] = value;
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function mergeSchema(left: ColumnSchema[], right: ColumnSchema[], rightPrefix: string): ColumnSchema[] {
  const names = new Set(left.map((c) => c.name));
  const result = [...left];
  for (const col of right) {
    if (names.has(col.name)) {
      result.push({ name: `${rightPrefix}${col.name}`, type: col.type });
    } else {
      result.push(col);
    }
  }
  return result;
}

function stringifyKey(value: Value): string {
  return value === undefined ? "undefined" : value === null ? "null" : String(value);
}

function compareRows(a: Row, b: Row, orderBy: OrderBySpec[]): number {
  for (const clause of orderBy) {
    const dir = clause.direction === "desc" ? -1 : 1;
    const av = a[clause.column];
    const bv = b[clause.column];
    if (av === bv) continue;
    return av! > bv! ? dir : -dir;
  }
  return 0;
}

function buildWindowSchema(base: ColumnSchema[], outputs: WindowOutputs): ColumnSchema[] {
  const schema: ColumnSchema[] = [...base];
  if (outputs.rowNumber !== undefined) {
    schema.push({ name: outputs.rowNumber || "row_number", type: "number" });
  }
  if (outputs.rank !== undefined) {
    schema.push({ name: outputs.rank || "rank", type: "number" });
  }
  if (outputs.denseRank !== undefined) {
    schema.push({ name: outputs.denseRank || "dense_rank", type: "number" });
  }
  if (outputs.runningSum) {
    schema.push({ name: outputs.runningSum.as || `running_sum_${outputs.runningSum.column}`, type: "number" });
  }
  if (outputs.runningAvg) {
    schema.push({ name: outputs.runningAvg.as || `running_avg_${outputs.runningAvg.column}`, type: "number" });
  }
  return schema;
}
