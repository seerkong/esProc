import { compileExpression, evaluateExpression } from "@esproc/expression";
import type { CompiledDSL, DSLExecutionContext } from "@esproc/spl-dsl";
import { compileDSL } from "@esproc/spl-dsl";

export interface WebIdeOptions {
  defaultDbPath?: string;
}

export interface WebIdeOuterCtx {
  sessionId?: string;
}

export interface WebIdeInnerCtx {
  lastEvaluated?: Map<string, unknown>;
}

export interface WebIdeErrorCtx {
  lastError?: unknown;
}

export interface WebIdeSupport {
  logger?: (message: string) => void;
  now?: () => Date;
}

export interface WebIdeExpressions {
  compile: typeof compileExpression;
  evaluate: typeof evaluateExpression;
}

export interface WebIdeDsl {
  compile: typeof compileDSL;
}

export interface WebIdeAdapters {
  sqliteQuery?: (options: { dbPath?: string; sql: string; params?: unknown[] }) => unknown | Promise<unknown>;
}

const createDefaultOptions = (): WebIdeOptions => ({});
const createDefaultOuterCtx = (): WebIdeOuterCtx => ({});
const createDefaultInnerCtx = (): WebIdeInnerCtx => ({ lastEvaluated: new Map() });
const createDefaultErrorCtx = (): WebIdeErrorCtx => ({});
const createDefaultSupport = (): WebIdeSupport => ({
  logger: (message) => console.warn("[web-ide]", message),
  now: () => new Date(),
});
const createDefaultExpressions = (): WebIdeExpressions => ({
  compile: compileExpression,
  evaluate: evaluateExpression,
});
const createDefaultDsl = (): WebIdeDsl => ({
  compile: compileDSL,
});

export interface WebIdeRuntimeInit {
  options?: WebIdeOptions;
  outerCtx?: WebIdeOuterCtx;
  innerCtx?: WebIdeInnerCtx;
  errorCtx?: WebIdeErrorCtx;
  support?: Partial<WebIdeSupport>;
  expressions?: Partial<WebIdeExpressions>;
  dsl?: Partial<WebIdeDsl>;
  adapters?: Partial<WebIdeAdapters>;
}

export class WebIdeRuntime {
  public expressions: WebIdeExpressions;
  public dsl: WebIdeDsl;

  public options: WebIdeOptions;
  public outerCtx: WebIdeOuterCtx;
  public innerCtx: WebIdeInnerCtx;
  public errorCtx: WebIdeErrorCtx;
  public support: WebIdeSupport;
  public adapters: WebIdeAdapters;

  constructor(init?: WebIdeRuntimeInit) {
    this.options = { ...createDefaultOptions(), ...(init?.options ?? {}) };
    this.outerCtx = init?.outerCtx ?? createDefaultOuterCtx();
    this.innerCtx = init?.innerCtx ?? createDefaultInnerCtx();
    this.errorCtx = init?.errorCtx ?? createDefaultErrorCtx();
    this.support = { ...createDefaultSupport(), ...(init?.support ?? {}) };
    this.expressions = { ...createDefaultExpressions(), ...(init?.expressions ?? {}) };
    this.dsl = { ...createDefaultDsl(), ...(init?.dsl ?? {}) };
    this.adapters = {
      ...(init?.adapters ?? {}),
    };
  }

  toDslContext(extraScope?: Record<string, unknown>, refs?: Record<string, unknown>): DSLExecutionContext {
    return {
      scope: { ...(extraScope ?? {}) },
      refs,
      adapters: this.adapters,
      defaultDbPath: this.options.defaultDbPath,
    };
  }

  compileDsl(source: string): CompiledDSL {
    return this.dsl.compile(source);
  }
}

export function createWebIdeRuntime(init?: WebIdeRuntimeInit): WebIdeRuntime {
  return new WebIdeRuntime(init);
}
