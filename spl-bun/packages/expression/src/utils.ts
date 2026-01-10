export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function truthy(value: unknown): boolean {
  if (isNullish(value)) return false;
  return Boolean(value);
}

export function assertArity(name: string, args: unknown[], min: number, max?: number): void {
  if (args.length < min || (max !== undefined && args.length > max)) {
    throw new Error(`Function ${name} expects ${min}${max ? `-${max}` : ""} arguments, got ${args.length}`);
  }
}
