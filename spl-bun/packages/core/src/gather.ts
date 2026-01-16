import type { Row, Value } from "./dataset";

export interface GatherContext {
  rows: Row[];
  index: number;
}

export interface GatherFunction {
  prepare(rows: Row[]): void;
  gather(ctx: GatherContext): Value;
  gatherWith(oldValue: Value, ctx: GatherContext): Value;
  finish(value: Value): Value;
}

export abstract class BaseGather implements GatherFunction {
  protected rows: Row[] = [];

  prepare(rows: Row[]): void {
    this.rows = rows;
  }

  abstract gather(ctx: GatherContext): Value;

  abstract gatherWith(oldValue: Value, ctx: GatherContext): Value;

  finish(value: Value): Value {
    return value;
  }
}

export function runGather(fn: GatherFunction, rows: Row[]): Value {
  if (!rows.length) return null;
  fn.prepare(rows);
  const first = fn.gather({ rows, index: 0 });
  let acc = first;
  for (let i = 1; i < rows.length; i += 1) {
    acc = fn.gatherWith(acc, { rows, index: i });
  }
  return fn.finish(acc);
}

export class SumGather extends BaseGather {
  constructor(private readonly field?: string, private readonly expr?: (row: Row) => number) {
    super();
  }

  gather(ctx: GatherContext): Value {
    return this.valueAt(ctx);
  }

  gatherWith(oldValue: Value, ctx: GatherContext): Value {
    const base = Number(oldValue ?? 0);
    const next = this.valueAt(ctx);
    return base + Number(next ?? 0);
  }

  private valueAt(ctx: GatherContext): number {
    const row = ctx.rows[ctx.index];
    if (this.expr) return this.expr(row);
    if (this.field) return Number(row[this.field] ?? 0);
    return 0;
  }
}

export class CountGather extends BaseGather {
  gather(): Value {
    return 1;
  }

  gatherWith(oldValue: Value): Value {
    return Number(oldValue ?? 0) + 1;
  }
}

export class AvgGather extends BaseGather {
  private count = 0;

  constructor(private readonly field?: string, private readonly expr?: (row: Row) => number) {
    super();
  }

  prepare(rows: Row[]): void {
    super.prepare(rows);
    this.count = 0;
  }

  gather(ctx: GatherContext): Value {
    this.count = 1;
    return this.valueAt(ctx);
  }

  gatherWith(oldValue: Value, ctx: GatherContext): Value {
    this.count += 1;
    const base = Number(oldValue ?? 0);
    return base + this.valueAt(ctx);
  }

  finish(value: Value): Value {
    if (!this.count) return null;
    return Number(value ?? 0) / this.count;
  }

  private valueAt(ctx: GatherContext): number {
    const row = ctx.rows[ctx.index];
    if (this.expr) return this.expr(row);
    if (this.field) return Number(row[this.field] ?? 0);
    return 0;
  }
}
