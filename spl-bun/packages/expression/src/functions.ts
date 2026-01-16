import { assertArity, isNullish, truthy } from "./utils";

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
  sin: (v: unknown) => Math.sin(toNumber(v)),
  cos: (v: unknown) => Math.cos(toNumber(v)),
  tan: (v: unknown) => Math.tan(toNumber(v)),
  log: (v: unknown) => Math.log(toNumber(v)),
  log10: (v: unknown) => Math.log10(toNumber(v)),
  ceil: (v: unknown) => Math.ceil(toNumber(v)),
  floor: (v: unknown) => Math.floor(toNumber(v)),
  round: (v: unknown, digits?: unknown) => {
    const val = toNumber(v);
    const d = Number(digits) || 0;
    if (d === 0) return Math.round(val);
    const factor = Math.pow(10, d);
    return Math.round(val * factor) / factor;
  },
  rand: () => Math.random(),
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
  replace: (str: unknown, search: unknown, replace: unknown) => {
    const s = String(str ?? "");
    const se = String(search ?? "");
    const re = String(replace ?? "");
    return s.split(se).join(re);
  },
  pos: (str: unknown, sub: unknown) => {
    const s = String(str ?? "");
    const su = String(sub ?? "");
    const idx = s.indexOf(su);
    return idx === -1 ? null : idx + 1;
  },
  split: (str: unknown, sep: unknown) => {
    const s = String(str ?? "");
    const se = String(sep ?? "");
    return se.length > 0 ? s.split(se) : s.split("");
  },
  left: (str: unknown, len: unknown) => {
    const s = String(str ?? "");
    const l = Number(len) || 0;
    return s.substring(0, Math.max(0, Math.min(l, s.length)));
  },
  right: (str: unknown, len: unknown) => {
    const s = String(str ?? "");
    const l = Number(len) || 0;
    return s.substring(Math.max(0, s.length - l));
  },
  mid: (str: unknown, start: unknown, len: unknown) => {
    const s = String(str ?? "");
    const st = Number(start) || 0;
    const l = Number(len) || 0;
    return s.substring(Math.max(0, st - 1), Math.max(0, st - 1 + l));
  },
  concat: (...args: unknown[]) => args.map((v) => (v == null ? "" : String(v))).join(""),
  nvl: (value: unknown, fallback: unknown) => (isNullish(value) ? fallback : value),
  now: () => new Date(),
  date: (str: unknown) => toDate(str),
  dateadd: (value: unknown, days: unknown) => {
    const base = toDate(value);
    if (!base) return null;
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  },
  month: (d: unknown) => {
    const date = toDate(d);
    return date ? date.getMonth() + 1 : null;
  },
  day: (d: unknown) => {
    const date = toDate(d);
    return date ? date.getDate() : null;
  },
  year: (d: unknown) => {
    const date = toDate(d);
    return date ? date.getFullYear() : null;
  },
  hour: (d: unknown) => {
    const date = toDate(d);
    return date ? date.getHours() : null;
  },
  minute: (d: unknown) => {
    const date = toDate(d);
    return date ? date.getMinutes() : null;
  },
  second: (d: unknown) => {
    const date = toDate(d);
    return date ? date.getSeconds() : null;
  },
  datevalue: (d: unknown) => {
    const date = toDate(d);
    if (!date) return null;
    return date.getTime();
  },
  datetime: (year: unknown, month: unknown, day: unknown, hour?: unknown, minute?: unknown, second?: unknown) => {
    const y = Number(year);
    const m = Number(month) - 1;
    const d = Number(day);
    const h = Number(hour) || 0;
    const min = Number(minute) || 0;
    const s = Number(second) || 0;
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
      return null;
    }
    const result = new Date(y, m, d, h, min, s);
    return Number.isNaN(result.getTime()) ? null : result;
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
  if: (...args: unknown[]): unknown => {
    if (args.length === 1) {
      return truthy(args[0]);
    }
    if (args.length === 2) {
      return truthy(args[0]) ? args[1] : null;
    }
    if (args.length === 3) {
      return truthy(args[0]) ? args[1] : args[2];
    }
    throw new Error("if() expects 1-3 arguments");
  },
  case: (...args: unknown[]): unknown => {
    if (args.length < 1) {
      throw new Error("case() expects at least 1 argument");
    }
    const value = args[0];
    for (let i = 1; i < args.length; i += 2) {
      if (i + 1 < args.length) {
        if (value === args[i]) {
          return args[i + 1];
        }
      }
    }
    return null;
  },
  ifp: (rawParams: unknown, scope: unknown): unknown => {
    if (typeof rawParams !== "string" || typeof scope !== "object" || scope == null) {
      throw new Error("ifp() expects (string, scope) arguments");
    }
    const { ifp } = require("./paramFunctions") as typeof import("./paramFunctions");
    return ifp(rawParams, scope as Record<string, unknown>);
  },
  casep: (rawParams: unknown, scope: unknown): unknown => {
    if (typeof rawParams !== "string" || typeof scope !== "object" || scope == null) {
      throw new Error("casep() expects (string, scope) arguments");
    }
    const { casep } = require("./paramFunctions") as typeof import("./paramFunctions");
    return casep(rawParams, scope as Record<string, unknown>);
  },
};

export function withCustomFunctions(overrides: FunctionRegistry): FunctionRegistry {
  const next: FunctionRegistry = { ...builtins };
  for (const [name, fn] of Object.entries(overrides)) {
    next[name.toLowerCase()] = fn;
  }
  return next;
}
