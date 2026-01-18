export type MemberPredicate = (target: unknown) => boolean;
import { truthy } from "./utils";
import { compileExpression } from "./evaluator";

export type MemberFunction = (target: unknown, ...args: unknown[]) => unknown;

interface MemberEntry {
  predicate: MemberPredicate;
  fn: MemberFunction;
}

export class MemberFunctionRegistry {
  private readonly entries = new Map<string, MemberEntry[]>();

  add(name: string, predicate: MemberPredicate, fn: MemberFunction): this {
    const key = name.toLowerCase();
    const list = this.entries.get(key) ?? [];
    list.push({ predicate, fn });
    this.entries.set(key, list);
    return this;
  }

  resolve(name: string, target: unknown): MemberFunction | null {
    const list = this.entries.get(name.toLowerCase());
    if (!list) return null;
    for (const entry of list) {
      if (entry.predicate(target)) return entry.fn;
    }
    return null;
  }
}

export const defaultMemberRegistry = new MemberFunctionRegistry();

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isDataSetLike = (v: unknown): v is { rows?: unknown[] } =>
  v != null && typeof v === "object" && "rows" in (v as Record<string, unknown>);
const hasTypeTag = (v: unknown): v is { __type: number } =>
  v != null && typeof v === "object" && "__type" in (v as Record<string, unknown>);
const isDbHandle = (v: unknown): v is { value: unknown; __type: number } =>
  hasTypeTag(v) && (v as { __type: number }).__type === 1;
const isFileHandle = (v: unknown): v is { value: unknown; __type: number } =>
  hasTypeTag(v) && (v as { __type: number }).__type === 2;
const isCursorHandle = (v: unknown): v is { value: unknown; __type: number } =>
  hasTypeTag(v) && (v as { __type: number }).__type === 5;
const unwrap = (v: unknown): unknown =>
  hasTypeTag(v) ? (v as { __type: number; value?: unknown }).value : v;

const isRecordLike = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v) && !hasTypeTag(v) && !isDataSetLike(v);

function isDataSet(value: unknown): value is { rows: Record<string, unknown>[]; schema?: { name: string; type?: string }[] } {
  return isDataSetLike(value) && Array.isArray((value as { rows?: unknown[] }).rows);
}

function resolveDataSetKeys(dataSet: { keys?: string[]; schema?: { name: string }[] }): string[] {
  if (Array.isArray(dataSet.keys) && dataSet.keys.length > 0) {
    return dataSet.keys;
  }
  if (Array.isArray(dataSet.schema)) {
    return dataSet.schema.map((col) => col.name);
  }
  return [];
}

const numericArray = (arr: unknown[]): number[] => arr.map((v) => Number(v)).filter((v) => !Number.isNaN(v));

function asRows(target: unknown): unknown[] {
  if (isArray(target)) return target;
  if (isDataSetLike(target)) return Array.isArray(target.rows) ? target.rows : [];
  return [];
}

function asDataSet(target: unknown): { rows: unknown[]; schema?: { name: string; type?: string }[] } | null {
  if (isDataSetLike(target)) {
    const dataSet = target as { rows?: unknown[]; schema?: { name: string; type?: string }[] };
    return { rows: Array.isArray(dataSet.rows) ? dataSet.rows : [], schema: dataSet.schema };
  }
  if (isArray(target)) {
    const rows = target as unknown[];
    const schema = rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null
      ? Object.keys(rows[0] as Record<string, unknown>).map((name) => ({ name, type: "unknown" }))
      : [];
    return { rows, schema };
  }
  return null;
}

function ensureDataSet(target: unknown): { rows: unknown[]; schema?: { name: string; type?: string }[] } {
  const dataSet = asDataSet(target);
  if (!dataSet) {
    throw new Error("Sequence member functions require array or table targets");
  }
  return dataSet;
}

function toDirection(value: unknown): "asc" | "desc" {
  if (typeof value === "string" && value.toLowerCase() === "desc") return "desc";
  return "asc";
}

function toSortSpec(expr: unknown, dir: unknown): { column: string; direction: "asc" | "desc" } {
  if (typeof expr !== "string" || expr.trim() === "") {
    throw new Error("sort() expects a column name string");
  }
  return { column: expr.trim(), direction: toDirection(dir) };
}

function toJoinSpec(spec: unknown): {
  type: "inner" | "left";
  leftKeys: string[];
  rightKeys?: string[];
  rightPrefix?: string;
  leftKeyExprs?: string[];
  rightKeyExprs?: string[];
} {
  if (!spec || typeof spec !== "object") {
    throw new Error("join() expects join spec object");
  }
  const raw = spec as Record<string, unknown>;
  const type = (typeof raw.type === "string" && raw.type.toLowerCase() === "left") ? "left" : "inner";
  const leftKeys = Array.isArray(raw.leftKeys) ? raw.leftKeys.map((v) => String(v)) : [];
  if (leftKeys.length === 0) {
    throw new Error("join() requires leftKeys");
  }
  const rightKeys = Array.isArray(raw.rightKeys) ? raw.rightKeys.map((v) => String(v)) : undefined;
  const rightPrefix = typeof raw.rightPrefix === "string" ? raw.rightPrefix : undefined;
  const leftKeyExprs = Array.isArray(raw.leftKeyExprs) ? raw.leftKeyExprs.map((v) => String(v)) : undefined;
  const rightKeyExprs = Array.isArray(raw.rightKeyExprs) ? raw.rightKeyExprs.map((v) => String(v)) : undefined;
  return { type, leftKeys, rightKeys, rightPrefix, leftKeyExprs, rightKeyExprs };
}

function toAggregateSpec(spec: unknown): {
  groupBy?: string[];
  aggregates: Record<string, (rows: Record<string, unknown>[]) => unknown>;
} {
  if (!spec || typeof spec !== "object") {
    throw new Error("group() expects aggregate spec object");
  }
  const raw = spec as Record<string, unknown>;
  const groupBy = Array.isArray(raw.groupBy) ? raw.groupBy.map((v) => String(v)) : undefined;
  const aggregates: Record<string, (rows: Record<string, unknown>[]) => unknown> = {};
  const aggSpec = raw.aggregates as Record<string, unknown> | undefined;
  if (!aggSpec || typeof aggSpec !== "object") {
    throw new Error("group() requires aggregates object");
  }
  for (const [name, entry] of Object.entries(aggSpec)) {
    if (!entry || typeof entry !== "object") {
      throw new Error("group() aggregate entry must be object");
    }
    const cfg = entry as Record<string, unknown>;
    const type = typeof cfg.type === "string" ? cfg.type.toLowerCase() : "";
    const field = typeof cfg.field === "string" ? cfg.field : undefined;
    if (type === "count") {
      aggregates[name] = (rows) => rows.length;
      continue;
    }
    if (type === "sum") {
      if (!field) throw new Error("group() sum requires field");
      aggregates[name] = (rows) =>
        rows.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[field] ?? 0), 0);
      continue;
    }
    if (type === "avg") {
      if (!field) throw new Error("group() avg requires field");
      aggregates[name] = (rows) => {
        const total = rows.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[field] ?? 0), 0);
        return rows.length ? total / rows.length : null;
      };
      continue;
    }
    if (type === "min") {
      if (!field) throw new Error("group() min requires field");
      aggregates[name] = (rows) => {
        const values = rows.map((row) => Number((row as Record<string, unknown>)[field] ?? NaN)).filter((v) => !Number.isNaN(v));
        return values.length ? Math.min(...values) : null;
      };
      continue;
    }
    if (type === "max") {
      if (!field) throw new Error("group() max requires field");
      aggregates[name] = (rows) => {
        const values = rows.map((row) => Number((row as Record<string, unknown>)[field] ?? NaN)).filter((v) => !Number.isNaN(v));
        return values.length ? Math.max(...values) : null;
      };
      continue;
    }
    throw new Error("group() aggregate type not supported");
  }
  return { groupBy, aggregates };
}

function toComputedColumns(spec: unknown): Record<string, string> {
  if (!spec || typeof spec !== "object") {
    throw new Error("derive() expects object mapping column -> expression");
  }
  const map: Record<string, string> = {};
  for (const [name, expr] of Object.entries(spec as Record<string, unknown>)) {
    if (typeof expr !== "string") {
      throw new Error("derive() expects expression strings");
    }
    map[name] = expr;
  }
  return map;
}

function mergeJoinRows(
  left: Record<string, unknown>,
  right: Record<string, unknown> | undefined,
  rightPrefix: string,
  rightSchema?: { name: string }[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...left };
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

function mergeJoinSchema(
  left: { name: string; type?: string }[] | undefined,
  right: { name: string; type?: string }[] | undefined,
  rightPrefix: string,
): { name: string; type?: string }[] {
  const leftSchema = left ?? [];
  const rightSchema = right ?? [];
  const names = new Set(leftSchema.map((col) => col.name));
  const result = [...leftSchema];
  for (const col of rightSchema) {
    if (names.has(col.name)) {
      result.push({ name: `${rightPrefix}${col.name}`, type: col.type });
    } else {
      result.push(col);
    }
  }
  return result;
}

function sumArray(arr: unknown[]): number | null {
  const nums = numericArray(arr);
  if (!nums.length) return null;
  return nums.reduce((acc, v) => acc + v, 0);
}

function avgArray(arr: unknown[]): number | null {
  const nums = numericArray(arr);
  if (!nums.length) return null;
  return nums.reduce((acc, v) => acc + v, 0) / nums.length;
}

function minArray(arr: unknown[]): number | null {
  const nums = numericArray(arr);
  if (!nums.length) return null;
  return Math.min(...nums);
}

function maxArray(arr: unknown[]): number | null {
  const nums = numericArray(arr);
  if (!nums.length) return null;
  return Math.max(...nums);
}

function resolveArrayArg(target: unknown, arg?: unknown): unknown[] {
  if (isArray(target)) return target;
  if (isDataSetLike(target)) return Array.isArray(target.rows) ? target.rows : [];
  if (typeof target === "string") return target.split("");
  if (target == null) return [];
  if (arg && typeof arg === "string" && typeof target === "object") {
    const values: unknown[] = [];
    for (const item of Object.values(target as Record<string, unknown>)) {
      values.push(item);
    }
    return values;
  }
  return [];
}

function pluck(arr: unknown[], field?: unknown): unknown[] {
  if (!field || typeof field !== "string") return arr;
  return arr.map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>)[field] : undefined));
}

// count
defaultMemberRegistry.add(
  "count",
  (target) => isArray(target) || isDataSetLike(target) || typeof target === "string",
  (target) => {
    if (isArray(target)) return target.length;
    if (typeof target === "string") return target.length;
    if (isDataSetLike(target) && Array.isArray(target.rows)) return target.rows.length;
    return 0;
  },
);

// sum/avg/min/max
for (const [name, fn] of [
  ["sum", sumArray],
  ["avg", avgArray],
  ["min", minArray],
  ["max", maxArray],
] as const) {
  defaultMemberRegistry.add(
    name,
    (target) => isArray(target) || isDataSetLike(target),
    (target, field?: unknown) => {
      const arr = resolveArrayArg(target, field);
      const values = pluck(arr, field);
      return fn(values);
    },
  );
}

function resolveFieldName(field?: unknown): string | null {
  if (typeof field === "string") return field;
  return null;
}

function resolveFieldKey(record: Record<string, unknown>, field: unknown): string | null {
  if (typeof field === "number" && Number.isFinite(field)) {
    const keys = Object.keys(record);
    const rawIndex = Math.trunc(field);
    if (rawIndex === 0) return null;
    const idx = rawIndex > 0 ? rawIndex - 1 : keys.length + rawIndex;
    if (idx < 0 || idx >= keys.length) return null;
    return keys[idx];
  }
  if (typeof field === "string") return field;
  return null;
}

// first/last

 defaultMemberRegistry.add(
  "first",
  (target) => isArray(target) || isDataSetLike(target),
  (target) => {
    const arr = resolveArrayArg(target);
    return arr.length ? arr[0] : null;
  },
);

 defaultMemberRegistry.add(
  "last",
  (target) => isArray(target) || isDataSetLike(target),
  (target) => {
    const arr = resolveArrayArg(target);
    return arr.length ? arr[arr.length - 1] : null;
  },
);

// db member functions
for (const name of ["query", "execute"] as const) {
  defaultMemberRegistry.add(
    name,
    (target) => isDbHandle(target),
    (target, ...args: unknown[]) => {
      const raw = unwrap(target) as { [key: string]: unknown } | null;
      const fn = raw && typeof raw[name] === "function" ? (raw[name] as (...params: unknown[]) => unknown) : null;
      if (!fn) {
        throw new Error(`${name}() is not available on db handle`);
      }
      return fn(...args);
    },
  );
}

for (const name of ["commit", "rollback"] as const) {
  defaultMemberRegistry.add(
    name,
    (target) => isDbHandle(target),
    (target) => {
      const raw = unwrap(target) as { [key: string]: unknown } | null;
      const fn = raw && typeof raw[name] === "function" ? (raw[name] as () => unknown) : null;
      if (!fn) {
        throw new Error(`${name}() is not available on db handle`);
      }
      return fn();
    },
  );
}

// file member functions
for (const name of ["read", "write", "import", "export"] as const) {
  defaultMemberRegistry.add(
    name,
    (target) => isFileHandle(target),
    (target, ...args: unknown[]) => {
      const raw = unwrap(target) as { [key: string]: unknown } | null;
      const fn = raw && typeof raw[name] === "function" ? (raw[name] as (...params: unknown[]) => unknown) : null;
      if (!fn) {
        throw new Error(`${name}() is not available on file handle`);
      }
      return fn(...args);
    },
  );
}

// cursor member functions
for (const name of ["fetch", "skip"] as const) {
  defaultMemberRegistry.add(
    name,
    (target) => isCursorHandle(target),
    (target, ...args: unknown[]) => {
      const raw = unwrap(target) as { [key: string]: unknown } | null;
      const fn = raw && typeof raw[name] === "function" ? (raw[name] as (...params: unknown[]) => unknown) : null;
      if (!fn) {
        throw new Error(`${name}() is not available on cursor handle`);
      }
      return fn(...args);
    },
  );
}

// record member functions

defaultMemberRegistry.add(
  "field",
  (target) => isRecordLike(target),
  (target, field?: unknown, value?: unknown) => {
    const record = target as Record<string, unknown>;
    if (field === undefined) {
      throw new Error("field() requires field name or index");
    }
    const resolved = resolveFieldKey(record, field);
    if (!resolved) return null;
    if (value === undefined) {
      return record[resolved];
    }
    record[resolved] = value;
    return null;
  },
);

defaultMemberRegistry.add(
  "fname",
  (target) => isRecordLike(target),
  (target, index?: unknown) => {
    const record = target as Record<string, unknown>;
    const keys = Object.keys(record);
    if (index === undefined) {
      return keys;
    }
    if (typeof index !== "number" || !Number.isFinite(index)) {
      throw new Error("fname() expects a numeric index");
    }
    const idx = Math.trunc(index) - 1;
    if (idx < 0) {
      throw new Error("fname() index must be >= 1");
    }
    return idx >= keys.length ? null : keys[idx];
  },
);

defaultMemberRegistry.add(
  "fno",
  (target) => isRecordLike(target),
  (target, field?: unknown) => {
    const record = target as Record<string, unknown>;
    if (field === undefined) return Object.keys(record).length;
    const resolved = resolveFieldKey(record, field);
    if (!resolved) return null;
    const keys = Object.keys(record);
    const idx = keys.indexOf(resolved);
    return idx === -1 ? null : idx + 1;
  },
);

defaultMemberRegistry.add(
  "key",
  (target) => isRecordLike(target),
  (target, ...fields: unknown[]) => {
    const record = target as Record<string, unknown>;
    if (fields.length === 0) {
      const keys = Object.keys(record);
      return keys.length === 1 ? record[keys[0]] : keys.map((key) => record[key]);
    }
    if (fields.length === 1) {
      const resolved = resolveFieldName(fields[0]);
      return resolved ? record[resolved] : null;
    }
    return fields.map((field) => {
      const resolved = resolveFieldName(field);
      return resolved ? record[resolved] : null;
    });
  },
);

defaultMemberRegistry.add(
  "record",
  (target) => isRecordLike(target),
  (target, values?: unknown) => {
    const record = target as Record<string, unknown>;
    if (!Array.isArray(values)) {
      if (values !== undefined && values !== null) {
        throw new Error("record() expects an array of values");
      }
      return record;
    }
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length && i < values.length; i += 1) {
      record[keys[i]] = values[i];
    }
    return record;
  },
);

// table member functions (DataSet)
 defaultMemberRegistry.add(
  "keys",
  (target) => isDataSetLike(target),
  (target, ...fields: unknown[]) => {
    const dataSet = target as { rows?: unknown[]; keys?: string[] };
    if (fields.length === 0) {
      return dataSet;
    }
    const names = fields.map((field) => {
      if (typeof field !== "string") {
        throw new Error("keys() expects string field names");
      }
      return field;
    });
    (dataSet as { keys?: string[] }).keys = names;
    return dataSet;
  },
);


 defaultMemberRegistry.add(
  "row",
  (target) => isDataSetLike(target),
  (target, key?: unknown) => {
    const dataSet = target as { rows?: unknown[]; keys?: string[]; schema?: { name: string }[] };
    const rows = Array.isArray(dataSet.rows) ? dataSet.rows : [];
    if (key === undefined) return null;
    const keys = Array.isArray(dataSet.keys) && dataSet.keys.length > 0
      ? dataSet.keys
      : Array.isArray(dataSet.schema)
        ? dataSet.schema.map((col) => col.name)
        : [];
    if (keys.length === 0) {
      return rows.find((row) => row && isRecordLike(row) && Object.values(row).includes(key)) ?? null;
    }
    return (
      rows.find((row) =>
        row &&
        isRecordLike(row) &&
        keys.every((field: string) => (row as Record<string, unknown>)[field] === key),
      ) ?? null
    );
  },
);

// sequence/table member functions
 defaultMemberRegistry.add(
  "select",
  (target) => isArray(target) || isDataSetLike(target),
  (target, expr?: unknown) => {
    if (typeof expr !== "string") {
      throw new Error("select() expects expression string");
    }
    const dataSet = ensureDataSet(target);
    const filtered = dataSet.rows.filter((row) => truthy(compileExpression(expr).evaluate(row)));
    return { rows: filtered, schema: dataSet.schema };
  },
);

 defaultMemberRegistry.add(
  "sort",
  (target) => isArray(target) || isDataSetLike(target),
  (target, expr?: unknown, dir?: unknown) => {
    const dataSet = ensureDataSet(target);
    const spec = toSortSpec(expr, dir);
    const sorted = [...dataSet.rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[spec.column];
      const bv = (b as Record<string, unknown>)[spec.column];
      if (av === bv) return 0;
      return av! > bv! ? (spec.direction === "desc" ? -1 : 1) : spec.direction === "desc" ? 1 : -1;
    });
    return { rows: sorted, schema: dataSet.schema };
  },
);

 defaultMemberRegistry.add(
  "derive",
  (target) => isArray(target) || isDataSetLike(target),
  (target, spec?: unknown) => {
    const dataSet = ensureDataSet(target);
    const columns = toComputedColumns(spec);
    const compiled = Object.fromEntries(
      Object.entries(columns).map(([name, expr]) => [name, compileExpression(expr)]),
    );
    const rows = dataSet.rows.map((row) => {
      const base = row && typeof row === "object" ? { ...(row as Record<string, unknown>) } : {};
      for (const [name, evaluator] of Object.entries(compiled)) {
        base[name] = evaluator.evaluate(base);
      }
      return base;
    });
    const schema = dataSet.schema ? [...dataSet.schema] : [];
    for (const col of Object.keys(columns)) {
      if (!schema.find((item) => item.name === col)) {
        schema.push({ name: col, type: "unknown" });
      }
    }
    return { rows, schema };
  },
);

 defaultMemberRegistry.add(
  "group",
  (target) => isArray(target) || isDataSetLike(target),
  (target, spec?: unknown) => {
    const dataSet = ensureDataSet(target);
    const { groupBy, aggregates } = toAggregateSpec(spec);
    const groupKeys = groupBy ?? [];
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of dataSet.rows) {
      const record = row as Record<string, unknown>;
      const key = groupKeys.map((k) => String(record[k])).join("|");
      const list = groups.get(key) ?? [];
      list.push(record);
      groups.set(key, list);
    }
    const resultRows: Record<string, unknown>[] = [];
    for (const [key, rows] of groups.entries()) {
      const groupRow: Record<string, unknown> = {};
      if (groupKeys.length > 0) {
        const parts = key.split("|");
        groupKeys.forEach((name, idx) => {
          groupRow[name] = parts[idx];
        });
      }
      for (const [alias, fn] of Object.entries(aggregates)) {
        groupRow[alias] = fn(rows);
      }
      resultRows.push(groupRow);
    }
    const schema = [
      ...groupKeys.map((name) => ({ name, type: "string" })),
      ...Object.keys(aggregates).map((name) => ({ name, type: "number" })),
    ];
    return { rows: resultRows, schema };
  },
);

 defaultMemberRegistry.add(
  "join",
  (target) => isArray(target) || isDataSetLike(target),
  (target, other?: unknown, spec?: unknown) => {
    const left = ensureDataSet(target);
    if (!isDataSet(other) && !Array.isArray(other)) {
      throw new Error("join() expects sequence/table as right operand");
    }
    const right = ensureDataSet(other);
    const joinSpec = toJoinSpec(spec);
    const rightKeys = joinSpec.rightKeys ?? joinSpec.leftKeys;
    if (joinSpec.leftKeys.length !== rightKeys.length) {
      throw new Error("join() key lengths must match");
    }
    const rightPrefix = joinSpec.rightPrefix ?? "right_";
    const rightKeyed = new Map<string, Record<string, unknown>[]>();
    const leftEvaluators = (joinSpec.leftKeyExprs ?? []).map((expr) => compileExpression(expr));
    const rightEvaluators = (joinSpec.rightKeyExprs ?? []).map((expr) => compileExpression(expr));
    const makeKey = (row: Record<string, unknown>, keys: string[], evals: ReturnType<typeof compileExpression>[]) => {
      if (evals.length > 0) {
        return evals.map((ev) => String(ev.evaluate(row))).join("\u0001");
      }
      return keys.map((k) => String(row[k])).join("\u0001");
    };
    const normalizeKey = (value: string) => value.toLowerCase();
    for (const row of right.rows as Record<string, unknown>[]) {
      const key = normalizeKey(makeKey(row, rightKeys, rightEvaluators));
      const list = rightKeyed.get(key) ?? [];
      list.push(row);
      rightKeyed.set(key, list);
    }
    const mergedRows: Record<string, unknown>[] = [];
    for (const row of left.rows as Record<string, unknown>[]) {
      const key = normalizeKey(makeKey(row, joinSpec.leftKeys, leftEvaluators));
      const matches = rightKeyed.get(key);
      if (matches && matches.length > 0) {
        for (const rightRow of matches) {
          mergedRows.push(mergeJoinRows(row, rightRow, rightPrefix, right.schema));
        }
      } else if (joinSpec.type === "left") {
        mergedRows.push(mergeJoinRows(row, undefined, rightPrefix, right.schema));
      }
    }
    const mergedSchema = mergeJoinSchema(left.schema, right.schema, rightPrefix);
    return { rows: mergedRows, schema: mergedSchema };
  },
);

