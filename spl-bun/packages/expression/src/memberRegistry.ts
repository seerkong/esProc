export type MemberPredicate = (target: unknown) => boolean;
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
const unwrap = (v: unknown): unknown =>
  hasTypeTag(v) ? (v as { __type: number; value?: unknown }).value : v;

const isRecordLike = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v) && !hasTypeTag(v) && !isDataSetLike(v);

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
  if (typeof field === "number" && Number.isFinite(field)) return String(field);
  return null;
}

function resolveFieldIndex(record: Record<string, unknown>, field: unknown): string | null {
  if (typeof field === "number" && Number.isFinite(field)) {
    const idx = Math.trunc(field) - 1;
    if (idx < 0) return null;
    const keys = Object.keys(record);
    return idx >= keys.length ? null : keys[idx];
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

// record member functions
defaultMemberRegistry.add(
  "field",
  (target) => isRecordLike(target),
  (target, field?: unknown, value?: unknown) => {
    const record = target as Record<string, unknown>;
    if (field === undefined) {
      throw new Error("field() requires field name or index");
    }
    const resolved = resolveFieldIndex(record, field);
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
    const resolved = resolveFieldIndex(record, field);
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
    const keys = resolveDataSetKeys(dataSet);
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
