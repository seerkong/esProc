import type { CompiledExpression, ExpressionNode, BinaryOperator, UnaryOperator } from "./ast";
import { builtins, type FunctionRegistry } from "./functions";
import { parseExpression } from "./parser";
import { isNullish, truthy } from "./utils";

function evaluateBinary(op: BinaryOperator, left: unknown, right: unknown): unknown {
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

export function evaluateAst(node: ExpressionNode, scope: Record<string, unknown>, registry: FunctionRegistry): unknown {
  switch (node.type) {
    case "literal":
      return node.value;
    case "identifier":
      return scope[node.name];
    case "unary":
      return evaluateUnary(node.op, evaluateAst(node.operand, scope, registry));
    case "binary":
      return evaluateBinary(node.op, evaluateAst(node.left, scope, registry), evaluateAst(node.right, scope, registry));
    case "call": {
      const fn = registry[node.callee.toLowerCase()];
      if (!fn) {
        throw new Error(`Unknown function '${node.callee}'`);
      }
      const args = node.args.map((a) => evaluateAst(a, scope, registry));
      return fn(...args);
    }
    default:
      // eslint-disable-next-line @typescript-eslint/redundant-type-constituents
      const exhaustive: never = node;
      return exhaustive;
  }
}

export function compileExpression(source: string, registry: FunctionRegistry = builtins): CompiledExpression {
  const ast = parseExpression(source);
  return {
    ast,
    source,
    evaluate: (scope) => evaluateAst(ast, scope, registry),
  };
}

export function evaluateExpression(
  source: string,
  scope: Record<string, unknown>,
  registry: FunctionRegistry = builtins,
): unknown {
  return compileExpression(source, registry).evaluate(scope);
}
