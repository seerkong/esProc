import type { CompiledExpression, ExpressionNode, BinaryOperator, UnaryOperator } from "./ast";
import { builtins, type FunctionRegistry } from "./functions";
import { defaultMemberRegistry, type MemberFunctionRegistry } from "./memberRegistry";
import { parseExpression } from "./parser";
import { isNullish, truthy } from "./utils";
import { getValueType, type TypedValue } from "./types";

function evaluateBinary(op: BinaryOperator, left: unknown, right: unknown, scope: Record<string, unknown>, registry: FunctionRegistry): unknown {
  switch (op) {
    case "add": {
      if (isNullish(left) || isNullish(right)) return null;
      if (typeof left === "string" || typeof right === "string") {
        return String(left ?? "") + String(right ?? "");
      }
      return Number(left) + Number(right);
    }
    case "subtract":
      if (isNullish(left) || isNullish(right)) return null;
      return Number(left) - Number(right);
    case "multiply":
      if (isNullish(left) || isNullish(right)) return null;
      return Number(left) * Number(right);
    case "divide":
      if (isNullish(left) || isNullish(right)) return null;
      return Number(left) / Number(right);
    case "mod":
      if (isNullish(left) || isNullish(right)) return null;
      return Number(left) % Number(right);
    case "eq":
      if (isNullish(left) && isNullish(right)) return true;
      if (isNullish(left) || isNullish(right)) return false;
      return left === right;
    case "neq":
      if (isNullish(left) && isNullish(right)) return false;
      if (isNullish(left) || isNullish(right)) return true;
      return left !== right;
    case "lt":
      if (isNullish(left) || isNullish(right)) return false;
      return (left as number) < (right as number);
    case "lte":
      if (isNullish(left) || isNullish(right)) return false;
      return (left as number) <= (right as number);
    case "gt":
      if (isNullish(left) || isNullish(right)) return false;
      return (left as number) > (right as number);
    case "gte":
      if (isNullish(left) || isNullish(right)) return false;
      return (left as number) >= (right as number);
    case "and":
      return truthy(left) && truthy(right);
    case "or":
      return truthy(left) || truthy(right);
    case "comma":
      return right;
    case "assign":
      if (typeof left !== "string") {
        throw new Error("Assignment target must be an identifier");
      }
      scope[left] = right;
      return right;
    case "add_assign":
      if (typeof left !== "string") {
        throw new Error("Assignment target must be an identifier");
      }
      const currentAdd = scope[left];
      const newValAdd = evaluateBinary("add", currentAdd, right, scope, registry);
      scope[left] = newValAdd;
      return newValAdd;
    case "subtract_assign":
      if (typeof left !== "string") {
        throw new Error("Assignment target must be an identifier");
      }
      const currentSub = scope[left];
      const newValSub = evaluateBinary("subtract", currentSub, right, scope, registry);
      scope[left] = newValSub;
      return newValSub;
    case "multiply_assign":
      if (typeof left !== "string") {
        throw new Error("Assignment target must be an identifier");
      }
      const currentMul = scope[left];
      const newValMul = evaluateBinary("multiply", currentMul, right, scope, registry);
      scope[left] = newValMul;
      return newValMul;
    case "divide_assign":
      if (typeof left !== "string") {
        throw new Error("Assignment target must be an identifier");
      }
      const currentDiv = scope[left];
      const newValDiv = evaluateBinary("divide", currentDiv, right, scope, registry);
      scope[left] = newValDiv;
      return newValDiv;
    case "mod_assign":
      if (typeof left !== "string") {
        throw new Error("Assignment target must be an identifier");
      }
      const currentMod = scope[left];
      const newValMod = evaluateBinary("mod", currentMod, right, scope, registry);
      scope[left] = newValMod;
      return newValMod;
    case "union": {
      const leftArr = Array.isArray(left) ? left : left == null ? [] : [left];
      const rightArr = Array.isArray(right) ? right : right == null ? [] : [right];
      const result: unknown[] = [];
      for (const item of leftArr) {
        if (!result.includes(item)) result.push(item);
      }
      for (const item of rightArr) {
        if (!result.includes(item)) result.push(item);
      }
      return result;
    }
    case "intersect": {
      if (!Array.isArray(left) && left != null) {
        throw new Error("intersect expects array operands");
      }
      if (!Array.isArray(right) && right != null) {
        throw new Error("intersect expects array operands");
      }
      const leftArr = Array.isArray(left) ? left : [];
      const rightArr = Array.isArray(right) ? right : [];
      return leftArr.filter((item) => rightArr.includes(item));
    }
    case "diff": {
      if (Array.isArray(left)) {
        const rightArr = Array.isArray(right) ? right : right == null ? [] : [right];
        return left.filter((item) => !rightArr.includes(item));
      }
      if (left == null) {
        return null;
      }
      if (right == null) {
        return left;
      }
      return Math.trunc(Number(left) / Number(right));
    }
    case "conj": {
      const leftArr = Array.isArray(left) ? left : left == null ? [] : [left];
      const rightArr = Array.isArray(right) ? right : right == null ? [] : [right];
      return leftArr.filter((item) => rightArr.includes(item));
    }
    default:
      throw new Error(`Unsupported operator ${op}`);
  }
}

function evaluateUnary(op: UnaryOperator, value: unknown): unknown {
  switch (op) {
    case "negate":
      return value == null ? null : -Number(value);
    case "plus":
      return value == null ? null : Number(value);
    case "not":
      return !truthy(value);
  }
}

export function evaluateAst(
  node: ExpressionNode,
  scope: Record<string, unknown>,
  registry: FunctionRegistry,
  memberRegistry: MemberFunctionRegistry = defaultMemberRegistry,
): unknown {
  switch (node.type) {
    case "literal":
      return node.value;
    case "identifier":
      return scope[node.name];
    case "member": {
      const obj = evaluateAst(node.object, scope, registry, memberRegistry);
      if (obj == null) return null;
      if (typeof obj === "object" && node.property in obj) {
        return (obj as Record<string, unknown>)[node.property];
      }
      return null;
    }
    case "member_call": {
      const target = evaluateAst(node.object, scope, registry, memberRegistry);
      if (target == null) {
        throw new Error(`Cannot call method '${node.method}' on null`);
      }
      if (node.method === "calc") {
        const args = node.args.map((arg) => evaluateAst(arg, scope, registry, memberRegistry));
        const exprSource = args[0];
        if (typeof exprSource !== "string") {
          throw new Error("calc() expects expression string argument");
        }
        const compiled = compileExpression(exprSource, registry, memberRegistry);
        const calcItem = (item: unknown) => {
          if (item && typeof item === "object") {
            return compiled.evaluate({ ...scope, ...(item as Record<string, unknown>) });
          }
          return compiled.evaluate({ ...scope, _: item });
        };
        if (Array.isArray(target)) {
          return target.map((item) => calcItem(item));
        }
        if (typeof target === "object" && target && "rows" in target) {
          const rows = (target as { rows?: unknown[] }).rows;
          if (Array.isArray(rows)) {
            return rows.map((row) => calcItem(row));
          }
        }
        return calcItem(target);
      }
      const memberFn = memberRegistry.resolve(node.method, target);
      if (memberFn) {
        const args = node.args.map((arg) => evaluateAst(arg, scope, registry, memberRegistry));
        return memberFn(target, ...args);
      }
      if (typeof target === "object" && target !== null) {
        const method = (target as Record<string, unknown>)[node.method];
        if (typeof method === "function") {
          const args = node.args.map((arg) => evaluateAst(arg, scope, registry, memberRegistry));
          return (method as (...args: unknown[]) => unknown).apply(target, args);
        }
      }
      throw new Error(`Unknown member function '${node.method}'`);
    }
    case "list": {
      return node.items.map((item) => evaluateAst(item, scope, registry, memberRegistry));
    }
    case "record": {
      const out: Record<string, unknown> = {};
      for (const entry of node.entries) {
        out[entry.key] = evaluateAst(entry.value, scope, registry, memberRegistry);
      }
      return out;
    }
    case "unary":
      return evaluateUnary(node.op, evaluateAst(node.operand, scope, registry, memberRegistry));
    case "binary": {
      if (node.op === "comma") {
        evaluateAst(node.left, scope, registry, memberRegistry);
        return evaluateAst(node.right, scope, registry, memberRegistry);
      }
      if (
        node.op === "assign" ||
        node.op === "add_assign" ||
        node.op === "subtract_assign" ||
        node.op === "multiply_assign" ||
        node.op === "divide_assign" ||
        node.op === "mod_assign"
      ) {
        if (node.left.type !== "identifier") {
          throw new Error("Assignment target must be an identifier");
        }
        const rightValue = evaluateAst(node.right, scope, registry, memberRegistry);
        return evaluateBinary(node.op, node.left.name, rightValue, scope, registry);
      }
      return evaluateBinary(
        node.op,
        evaluateAst(node.left, scope, registry, memberRegistry),
        evaluateAst(node.right, scope, registry, memberRegistry),
        scope,
        registry,
      );
    }
    case "call": {
      const fn = registry[node.callee.toLowerCase()];
      if (!fn) {
        throw new Error(`Unknown function '${node.callee}'`);
      }
      const args = node.args.map((a) => evaluateAst(a, scope, registry, memberRegistry));
      return fn(...args);
    }
    default:
      // eslint-disable-next-line @typescript-eslint/redundant-type-constituents
      const exhaustive: never = node;
      return exhaustive;
  }
}

export function compileExpression(
  source: string,
  registry: FunctionRegistry = builtins,
  memberRegistry: MemberFunctionRegistry = defaultMemberRegistry,
): CompiledExpression {
  const ast = parseExpression(source);
  return {
    ast,
    source,
    evaluate: (scope) => evaluateAst(ast, scope, registry, memberRegistry),
  };
}

export function evaluateExpression(
  source: string,
  scope: Record<string, unknown>,
  registry: FunctionRegistry = builtins,
  memberRegistry: MemberFunctionRegistry = defaultMemberRegistry,
): unknown {
  return compileExpression(source, registry, memberRegistry).evaluate(scope);
}

export function evaluateTypedExpression(
  source: string,
  scope: Record<string, unknown>,
  registry: FunctionRegistry = builtins,
  memberRegistry: MemberFunctionRegistry = defaultMemberRegistry,
): TypedValue {
  const value = evaluateExpression(source, scope, registry, memberRegistry);
  return { value, type: getValueType(value) };
}
