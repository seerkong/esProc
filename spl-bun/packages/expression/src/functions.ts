import { assertArity, isNullish } from "./utils";

export type FunctionRegistry = Record<string, (...args: unknown[]) => unknown>;

function toNumber(value: unknown): number {
  if (isNullish(value)) {
    return NaN;
  }
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return n;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

function numericArray(arg: unknown): number[] {
  if (!Array.isArray(arg)) return [];
  return arg.map((v) => toNumber(v)).filter((v) => !Number.isNaN(v));
}

export const builtins: FunctionRegistry = {
  abs: (v: unknown) => Math.abs(toNumber(v)),
  pow: (a: unknown, b: unknown) => Math.pow(toNumber(a), toNumber(b)),
  sqrt: (v: unknown) => Math.sqrt(toNumber(v)),
  len: (v: unknown) =>
    typeof v === "string" || Array.isArray(v) ? v.length : v == null ? 0 : String(v).length,
  upper: (v: unknown) => (v == null ? null : String(v).toUpperCase()),
  lower: (v: unknown) => (v == null ? null : String(v).toLowerCase()),
  trim: (v: unknown) => (v == null ? null : String(v).trim()),
  substr: (v: unknown, start: unknown, length?: unknown) => {
    const s = String(v ?? "");
    const st = Number(start) || 0;
    if (length === undefined) return s.substring(st);
    return s.substring(st, st + (Number(length) || 0));
  },
  concat: (...args: unknown[]) => args.map((v) => (v == null ? "" : String(v))).join(""),
  nvl: (value: unknown, fallback: unknown) => (isNullish(value) ? fallback : value),
  now: () => new Date(),
  dateadd: (value: unknown, days: unknown) => {
    const base = toDate(value);
    if (!base) return null;
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  },
  datediff: (a: unknown, b: unknown) => {
    const da = toDate(a);
    const db = toDate(b);
    if (!da || !db) return null;
    const diffMs = da.getTime() - db.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  },
  format: (value: unknown, fmt?: unknown) => {
    const d = toDate(value);
    if (!d) return null;
    const formatStr = typeof fmt === "string" ? fmt : "iso";
    if (formatStr.toLowerCase() === "date") {
      return d.toISOString().slice(0, 10);
    }
    return d.toISOString();
  },
  sum: (arr: unknown) => {
    const values = numericArray(arr);
    return values.reduce((acc, v) => acc + v, 0);
  },
  avg: (arr: unknown) => {
    const values = numericArray(arr);
    const res = average(values);
    return res ?? null;
  },
  min: (arr: unknown) => {
    const values = numericArray(arr);
    return values.length === 0 ? null : Math.min(...values);
  },
  max: (arr: unknown) => {
    const values = numericArray(arr);
    return values.length === 0 ? null : Math.max(...values);
  },
  range: (start: unknown, end: unknown) => {
    const s = Number(start);
    const e = Number(end);
    if (Number.isNaN(s) || Number.isNaN(e)) return [];
    const step = s <= e ? 1 : -1;
    const out: number[] = [];
    for (let i = s; step > 0 ? i <= e : i >= e; i += step) {
      out.push(i);
    }
    return out;
  },
};

export function withCustomFunctions(overrides: FunctionRegistry): FunctionRegistry {
  const next: FunctionRegistry = { ...builtins };
  for (const [name, fn] of Object.entries(overrides)) {
    next[name.toLowerCase()] = fn;
  }
  return next;
}
