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
