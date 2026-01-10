import type { BinaryOperator, ExpressionNode, UnaryOperator } from "./ast";

type TokenType = "number" | "string" | "identifier" | "operator" | "paren" | "comma" | "eof";

interface Token {
  type: TokenType;
  value?: string;
  position: number;
}

const OPERATORS = [
  "==",
  "!=",
  ">=",
  "<=",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&&",
  "||",
];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const isAlpha = (c: string) => /[a-zA-Z_]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);
  const peek = () => input[i];

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let value = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
        } else {
          value += input[i];
          i += 1;
        }
      }
      if (input[i] !== quote) {
        throw new Error(`Unterminated string at position ${i}`);
      }
      i += 1;
      tokens.push({ type: "string", value, position: i });
      continue;
    }
    if (isDigit(ch) || (ch === "." && isDigit(input[i + 1]))) {
      let num = ch;
      i += 1;
      while (i < input.length && (isDigit(input[i]) || input[i] === ".")) {
        num += input[i];
        i += 1;
      }
      tokens.push({ type: "number", value: num, position: i });
      continue;
    }
    if (isAlpha(ch)) {
      let ident = ch;
      i += 1;
      while (i < input.length && (isAlpha(input[i]) || isDigit(input[i]))) {
        ident += input[i];
        i += 1;
      }
      tokens.push({ type: "identifier", value: ident, position: i });
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch, position: i });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", position: i });
      i += 1;
      continue;
    }

    const twoChar = input.slice(i, i + 2);
    const op =
      OPERATORS.find((o) => input.startsWith(o, i)) ??
      (ch === "&" && peek() === "&" ? "&&" : ch === "|" && peek() === "|" ? "||" : undefined);
    if (op) {
      tokens.push({ type: "operator", value: op, position: i });
      i += op.length;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: "eof", position: input.length });
  return tokens;
}

export function parseExpression(source: string): ExpressionNode {
  const tokens = tokenize(source);
  let idx = 0;

  const current = () => tokens[idx];
  const consume = () => tokens[idx++];
  const match = (type: TokenType, value?: string) => {
    const tok = current();
    if (tok.type === type && (value === undefined || tok.value?.toLowerCase() === value.toLowerCase())) {
      idx += 1;
      return tok;
    }
    return null;
  };

  function parsePrimary(): ExpressionNode {
    const tok = current();
    if (match("number")) {
      return { type: "literal", value: Number(tok.value) };
    }
    if (match("string")) {
      return { type: "literal", value: tok.value ?? "" };
    }
    if (match("identifier", "true")) return { type: "literal", value: true };
    if (match("identifier", "false")) return { type: "literal", value: false };
    if (match("identifier", "null")) return { type: "literal", value: null };

    if (tok.type === "identifier") {
      consume();
      const name = tok.value!;
      if (match("paren", "(")) {
        const args: ExpressionNode[] = [];
        if (!match("paren", ")")) {
          do {
            args.push(parseOr());
          } while (match("comma"));
          if (!match("paren", ")")) {
            throw new Error(`Expected ')' at position ${current().position}`);
          }
        }
        return { type: "call", callee: name, args };
      }
      return { type: "identifier", name };
    }

    if (match("paren", "(")) {
      const expr = parseOr();
      if (!match("paren", ")")) {
        throw new Error(`Expected ')' at position ${current().position}`);
      }
      return expr;
    }

    throw new Error(`Unexpected token at position ${tok.position}`);
  }

  function parseUnary(): ExpressionNode {
    const tok = current();
    if (tok.type === "operator" && tok.value === "-") {
      consume();
      return { type: "unary", op: "negate", operand: parseUnary() };
    }
    if (tok.type === "operator" && tok.value === "+") {
      consume();
      return { type: "unary", op: "plus", operand: parseUnary() };
    }
    if (tok.type === "identifier" && tok.value?.toLowerCase() === "not") {
      consume();
      return { type: "unary", op: "not", operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parseMultiplicative(): ExpressionNode {
    let node = parseUnary();
    while (true) {
      const tok = current();
      let op: BinaryOperator | null = null;
      if (tok.type === "operator" && tok.value === "*") op = "multiply";
      else if (tok.type === "operator" && tok.value === "/") op = "divide";
      else if (tok.type === "operator" && tok.value === "%") op = "mod";
      if (!op) break;
      consume();
      node = { type: "binary", op, left: node, right: parseUnary() };
    }
    return node;
  }

  function parseAdditive(): ExpressionNode {
    let node = parseMultiplicative();
    while (true) {
      const tok = current();
      let op: BinaryOperator | null = null;
      if (tok.type === "operator" && tok.value === "+") op = "add";
      else if (tok.type === "operator" && tok.value === "-") op = "subtract";
      if (!op) break;
      consume();
      node = { type: "binary", op, left: node, right: parseMultiplicative() };
    }
    return node;
  }

  function parseComparison(): ExpressionNode {
    let node = parseAdditive();
    while (true) {
      const tok = current();
      let op: BinaryOperator | null = null;
      if (tok.type === "operator" && ["<", ">", "<=", ">="].includes(tok.value ?? "")) {
        if (tok.value === "<") op = "lt";
        else if (tok.value === ">") op = "gt";
        else if (tok.value === "<=") op = "lte";
        else if (tok.value === ">=") op = "gte";
      } else if (tok.type === "operator" && ["=", "==", "!="].includes(tok.value ?? "")) {
        op = tok.value === "!=" ? "neq" : "eq";
      }
      if (!op) break;
      consume();
      node = { type: "binary", op, left: node, right: parseAdditive() };
    }
    return node;
  }

  function parseAnd(): ExpressionNode {
    let node = parseComparison();
    while (true) {
      const tok = current();
      if (
        (tok.type === "identifier" && tok.value?.toLowerCase() === "and") ||
        (tok.type === "operator" && tok.value === "&&")
      ) {
        consume();
        node = { type: "binary", op: "and", left: node, right: parseComparison() };
      } else {
        break;
      }
    }
    return node;
  }

  function parseOr(): ExpressionNode {
    let node = parseAnd();
    while (true) {
      const tok = current();
      if (
        (tok.type === "identifier" && tok.value?.toLowerCase() === "or") ||
        (tok.type === "operator" && tok.value === "||")
      ) {
        consume();
        node = { type: "binary", op: "or", left: node, right: parseAnd() };
      } else {
        break;
      }
    }
    return node;
  }

  const result = parseOr();
  if (current().type !== "eof") {
    throw new Error(`Unexpected token at position ${current().position}`);
  }
  return result;
}
