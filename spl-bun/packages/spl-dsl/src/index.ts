import { compileExpression } from "@esproc/expression";

export type DSLNodeType = "sql" | "if" | "return" | "expr" | "memberCall" | "globalCall";

export interface DSLNode {
  type: DSLNodeType;
  expression: string;
  condition?: string;
  thenExpression?: string;
  elseExpression?: string;
}

export interface MemberCallNode extends DSLNode {
  type: "memberCall";
  object: string;
  method: string;
  args: string[];
  parsedArgs?: ParsedArg[];
}

export interface GlobalCallNode extends DSLNode {
  type: "globalCall";
  function: string;
  args: string[];
  parsedArgs?: ParsedArg[];
}

export interface DBConnection {
  name: string;
  type: "sqlite" | "jdbc" | string;
  path?: string;
  driver?: string;
  url?: string;
}

export interface DSLExecutionContext {
  scope?: Record<string, unknown>;
  refs?: Record<string, unknown>;
  adapters?: {
    sqliteQuery?: (options: { connection?: DBConnection; dbPath?: string; sql: string; params?: unknown[] }) => unknown | Promise<unknown>;
    sqliteExecute?: (options: { connection?: DBConnection; dbPath?: string; sql: string; params?: unknown[] }) => unknown | Promise<unknown>;
    connect?: (name: string) => DBConnection | Promise<DBConnection>;
  };
  connections?: Map<string, DBConnection>;
  defaultDbPath?: string;
}

export interface CompiledDSL {
  node: DSLNode;
  evaluate(ctx?: DSLExecutionContext): Promise<unknown>;
}

const SQL_PREFIX = "$q(";

type ParsedArgKind = "string" | "identifier" | "number";

interface ParsedArg {
  raw: string;
  kind: ParsedArgKind;
  value: string | number;
}

function trimParens(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSingleArg(text: string): ParsedArg {
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return { raw: text, kind: "string", value: text.slice(1, -1) };
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return { raw: text, kind: "number", value: Number(text) };
  }
  return { raw: text, kind: "identifier", value: text };
}

function parseArguments(text: string): ParsedArg[] {
  const args: ParsedArg[] = [];
  let current = "";
  let inString = false;
  let quoteChar: string | null = null;
  let escapeNext = false;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) {
      args.push(parseSingleArg(trimmed));
    }
    current = "";
  };

  for (const ch of text) {
    if (inString) {
      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        escapeNext = true;
        current += ch;
        continue;
      }
      current += ch;
      if (ch === quoteChar) {
        inString = false;
        quoteChar = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      current += ch;
      continue;
    }
    if (ch === ",") {
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return args;
}

function resolveArgValue(arg: ParsedArg, ctx?: DSLExecutionContext): unknown {
  if (arg.kind === "string" || arg.kind === "number") {
    return arg.value;
  }
  const scope = { ...(ctx?.scope ?? {}), ...(ctx?.refs ?? {}) };
  if (Object.prototype.hasOwnProperty.call(scope, arg.value)) {
    return scope[arg.value];
  }
  return undefined;
}

function resolveConnection(name: string, ctx?: DSLExecutionContext): DBConnection {
  const connection = ctx?.connections?.get(name);
  if (!connection) {
    throw new Error(`Connection '${name}' not found`);
  }
  return connection;
}

function ensureParsedArgs(node: MemberCallNode | GlobalCallNode): ParsedArg[] {
  if (node.parsedArgs && node.parsedArgs.length > 0) {
    return node.parsedArgs;
  }
  return (node.args ?? []).map((value) => parseSingleArg(String(value)));
}

export function parseDSL(source: string): DSLNode {
  const text = source.trim();
  if (!text) {
    return { type: "expr", expression: "" };
  }

  if (text.startsWith(SQL_PREFIX) && text.endsWith(")")) {
    const inner = trimParens(text.slice(SQL_PREFIX.length - 1));
    return { type: "sql", expression: inner };
  }

  const memberMatch = text.match(/^([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\((.*)\)$/s);
  if (memberMatch) {
    const [, object, method, argsText] = memberMatch;
    const parsedArgs = parseArguments(argsText ?? "");
    return {
      type: "memberCall",
      expression: text,
      object,
      method,
      args: parsedArgs.map((arg) => String(arg.value)),
      parsedArgs,
    };
  }

  const globalMatch = text.match(/^([a-zA-Z_][\w]*)\((.*)\)$/s);
  if (globalMatch) {
    const [, func, argsText] = globalMatch;
    const parsedArgs = parseArguments(argsText ?? "");
    return {
      type: "globalCall",
      expression: text,
      function: func,
      args: parsedArgs.map((arg) => String(arg.value)),
      parsedArgs,
    };
  }

  if (text.toLowerCase().startsWith("if ")) {
    const withoutIf = text.slice(2).trim();
    // support simple `if <cond> return <expr>` or `if <cond> then <expr> else <expr>`
    const lower = withoutIf.toLowerCase();
    if (lower.includes(" then ")) {
      const [condPart, rest] = splitOnce(withoutIf, /\bthen\b/i);
      const [thenPart, elsePart] = splitOnce(rest ?? "", /\belse\b/i);
      return {
        type: "if",
        expression: text,
        condition: condPart.trim(),
        thenExpression: (thenPart ?? "").trim(),
        elseExpression: (elsePart ?? "").trim(),
      };
    }
    if (lower.includes(" return ")) {
      const [condPart, returnPart] = splitOnce(withoutIf, /\breturn\b/i);
      return {
        type: "if",
        expression: text,
        condition: condPart.trim(),
        thenExpression: (returnPart ?? "").trim(),
      };
    }
  }

  if (text.toLowerCase().startsWith("return ")) {
    return { type: "return", expression: text.slice(7).trim() };
  }

  return { type: "expr", expression: text };
}

function splitOnce(input: string, pattern: RegExp): [string, string?] {
  const match = pattern.exec(input);
  if (!match || match.index === undefined) return [input];
  const idx = match.index;
  const before = input.slice(0, idx).trim();
  const after = input.slice(idx + match[0].length).trim();
  return [before, after];
}

export function compileDSL(source: string): CompiledDSL {
  const node = parseDSL(source);
  switch (node.type) {
    case "sql": {
      const sqlText = node.expression;
      return {
        node,
        evaluate: async (ctx) => {
          const adapter = ctx?.adapters?.sqliteQuery;
          if (!adapter) {
            throw new Error("No sqliteQuery adapter provided for DSL SQL execution");
          }
          return adapter({
            dbPath: ctx?.defaultDbPath,
            sql: sqlText,
            params: ctx?.scope ? Object.values(ctx.scope) : undefined,
          });
        },
      };
    }
    case "if": {
      const condExpr = compileExpression(node.condition ?? "");
      const thenExpr = compileExpression(node.thenExpression ?? "");
      const elseExpr = node.elseExpression ? compileExpression(node.elseExpression) : undefined;
      return {
        node,
        evaluate: async (ctx) => {
          const scope = { ...(ctx?.scope ?? {}), ...(ctx?.refs ?? {}) };
          const condVal = condExpr.evaluate(scope);
          const truthy = !!condVal;
          if (truthy) {
            return thenExpr.evaluate(scope);
          }
          if (elseExpr) {
            return elseExpr.evaluate(scope);
          }
          return undefined;
        },
      };
    }
    case "return": {
      const compiled = compileExpression(node.expression);
      return {
        node,
        evaluate: async (ctx) => {
          return compiled.evaluate({ ...(ctx?.scope ?? {}), ...(ctx?.refs ?? {}) });
        },
      };
    }
    case "memberCall": {
      const memberNode = node as MemberCallNode;
      return {
        node,
        evaluate: async (ctx) => {
          const args = ensureParsedArgs(memberNode);
          const scope = { ...(ctx?.scope ?? {}), ...(ctx?.refs ?? {}) };

          if (Object.prototype.hasOwnProperty.call(scope, memberNode.object)) {
            const target = (scope as any)[memberNode.object];
            if (memberNode.method === "count") {
              if (Array.isArray(target)) return target.length;
              if (target && typeof target === "object") {
                if (Array.isArray((target as any).rows)) return (target as any).rows.length;
                if (typeof (target as any).length === "number") return (target as any).length;
              }
              throw new Error(`count() unsupported for ${memberNode.object}`);
            }
            if (typeof target === "object" && target !== null && memberNode.method in target) {
              const fn = (target as any)[memberNode.method];
              if (typeof fn === "function") {
                const params = args.map((arg) => resolveArgValue(arg, ctx));
                return fn.apply(target, params);
              }
            }
            throw new Error(`Unknown member function '${memberNode.method}' on ${memberNode.object}`);
          }

          const sqlArg = args[0];
          if (args.length === 0) {
            throw new Error(`${memberNode.method}() requires at least 1 argument`);
          }
          if (sqlArg.kind !== "string") {
            throw new Error(`${memberNode.method}() requires SQL string as first argument`);
          }
          const connection = resolveConnection(memberNode.object, ctx);
          const params = args.slice(1).map((arg) => resolveArgValue(arg, ctx));
          if (memberNode.method === "query") {
            const adapter = ctx?.adapters?.sqliteQuery;
            if (!adapter) {
              throw new Error("No sqliteQuery adapter provided for query()");
            }
            return adapter({
              connection,
              dbPath: ctx?.defaultDbPath,
              sql: String(sqlArg.value),
              params: params.length ? params : undefined,
            });
          }
          if (memberNode.method === "execute") {
            const adapter = ctx?.adapters?.sqliteExecute ?? ctx?.adapters?.sqliteQuery;
            if (!adapter) {
              throw new Error("No sqliteExecute adapter provided for execute()");
            }
            return adapter({
              connection,
              dbPath: ctx?.defaultDbPath,
              sql: String(sqlArg.value),
              params: params.length ? params : undefined,
            });
          }
          throw new Error(`Unknown member function '${memberNode.method}'`);
        },
      };
    }
    case "globalCall": {
      const globalNode = node as GlobalCallNode;
      return {
        node,
        evaluate: async (ctx) => {
          const args = ensureParsedArgs(globalNode);
          if (args.length === 0) {
            throw new Error(`${globalNode.function}() requires at least 1 argument`);
          }
          if (globalNode.function === "connect") {
            if (args.length === 1) {
              const nameArg = args[0];
              const name =
                nameArg.kind === "string" || nameArg.kind === "number"
                  ? String(nameArg.value)
                  : String(resolveArgValue(nameArg, ctx) ?? nameArg.value);
              const existing = ctx?.connections?.get(name);
              if (existing) {
                return existing;
              }
              if (ctx?.adapters?.connect) {
                const conn = await ctx.adapters.connect(name);
                if (conn && ctx.connections) {
                  ctx.connections.set(conn.name ?? name, conn);
                }
                return conn;
              }
              throw new Error(`Connection '${name}' not found`);
            }

            if (args.length >= 2) {
              const driverArg = args[0];
              const urlArg = args[1];
              const driver =
                driverArg.kind === "string" || driverArg.kind === "number"
                  ? String(driverArg.value)
                  : String(resolveArgValue(driverArg, ctx) ?? driverArg.value);
              const url =
                urlArg.kind === "string" || urlArg.kind === "number"
                  ? String(urlArg.value)
                  : String(resolveArgValue(urlArg, ctx) ?? urlArg.value);
              const conn: DBConnection = { name: url, type: "jdbc", driver, url };
              if (ctx?.connections) {
                ctx.connections.set(conn.name, conn);
              }
              return conn;
            }

            throw new Error("connect() requires at least 1 argument");
          }
          throw new Error(`Unknown global function '${globalNode.function}'`);
        },
      };
    }
    case "expr":
    default: {
      const compiled = compileExpression(node.expression);
      return {
        node,
        evaluate: async (ctx) => compiled.evaluate({ ...(ctx?.scope ?? {}), ...(ctx?.refs ?? {}) }),
      };
    }
  }
}
