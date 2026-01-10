export type LiteralValue = number | string | boolean | null;

export type ExpressionNode =
  | { type: "literal"; value: LiteralValue }
  | { type: "identifier"; name: string }
  | { type: "unary"; op: UnaryOperator; operand: ExpressionNode }
  | { type: "binary"; op: BinaryOperator; left: ExpressionNode; right: ExpressionNode }
  | { type: "call"; callee: string; args: ExpressionNode[] };

export type UnaryOperator = "negate" | "not" | "plus";
export type BinaryOperator =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "mod"
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "and"
  | "or";

export interface CompiledExpression {
  ast: ExpressionNode;
  source: string;
  evaluate(scope: Record<string, unknown>): unknown;
}
