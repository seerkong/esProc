import { compileExpression, evaluateExpression } from "../src/index";

const scope = { a: 2, b: 5, name: null, text: "Hello", nums: [1, 2, 3] };

describe("expression parser and evaluator", () => {
  test("respects operator precedence and parentheses", () => {
    expect(evaluateExpression("a + b * 2", scope)).toBe(12);
    expect(evaluateExpression("(a + b) * 2", scope)).toBe(14);
    expect(evaluateExpression("-a + b", scope)).toBe(3);
  });

  test("logical operators and null semantics", () => {
    expect(evaluateExpression("a > 1 and b < 10", scope)).toBe(true);
    expect(evaluateExpression("name == null", scope)).toBe(true);
    expect(evaluateExpression("name != null", scope)).toBe(false);
    expect(evaluateExpression("name or a", scope)).toBe(true);
  });

  test("assignment, member access, and set operators", () => {
    const local = { a: 1, obj: { x: 10 }, left: [1, 2, 3], right: [3, 4] } as Record<string, unknown>;
    expect(evaluateExpression("a = 5", local)).toBe(5);
    expect(local.a).toBe(5);
    expect(evaluateExpression("a += 2", local)).toBe(7);
    expect(local.a).toBe(7);
    expect(evaluateExpression("obj.x", local)).toBe(10);
    expect(evaluateExpression("left.count()", local)).toBe(3);
    expect(evaluateExpression("left.sum()", local)).toBe(6);
    expect(evaluateExpression("left.avg()", local)).toBe(2);
    expect(evaluateExpression("left.min()", local)).toBe(1);
    expect(evaluateExpression("left.max()", local)).toBe(3);
    expect(evaluateExpression("left.first()", local)).toBe(1);
    expect(evaluateExpression("left.last()", local)).toBe(3);
    expect(evaluateExpression("left.calc(\"_ * 2\")", local)).toEqual([2, 4, 6]);
    expect(evaluateExpression("[1,2,3]", local)).toEqual([1, 2, 3]);
    expect(evaluateExpression("{x: 1, y: 2}", local)).toEqual({ x: 1, y: 2 });
    expect(evaluateExpression("left & right", local)).toEqual([1, 2, 3, 4]);
    expect(evaluateExpression("left ^ right", local)).toEqual([3]);
    expect(evaluateExpression("left \\ right", local)).toEqual([1, 2]);
    expect(evaluateExpression("5 \\ 2", local)).toBe(2);
    expect(evaluateExpression("left | right", local)).toEqual([3]);
    expect(evaluateExpression("true || false", local)).toBe(true);
    expect(evaluateExpression("a = 1, a = a + 2", local)).toBe(3);
    expect(evaluateExpression("a = 1, a += 2", local)).toBe(3);
  });

  test("control flow functions", () => {
    expect(evaluateExpression("if(a > 1, \"yes\", \"no\")", scope)).toBe("yes");
    expect(evaluateExpression("if(a < 1, \"yes\", \"no\")", scope)).toBe("no");
    expect(evaluateExpression("case(a, 1, \"one\", 2, \"two\", 3, \"three\")", scope)).toBe("two");
  });

  test("control flow param variants", () => {
    const condScope = { a: 1, b: 2 };
    expect(evaluateExpression("ifp(\"a:b, b:4; 0\", ctx)", { ctx: condScope })).toBe(2);
    expect(evaluateExpression("casep(\"a,1:'one',2:'two';'none'\", ctx)", { ctx: { a: 2 } })).toBe("two");
  });

  test("math helpers", () => {
    expect(evaluateExpression("round(3.14159, 2)", scope)).toBeCloseTo(3.14);
    expect(evaluateExpression("ceil(1.2)", scope)).toBe(2);
    expect(evaluateExpression("floor(1.8)", scope)).toBe(1);
    expect(typeof evaluateExpression("rand()", scope)).toBe("number");
  });

  test("functions basic set", () => {
    expect(evaluateExpression("len(text)", scope)).toBe(5);
    expect(evaluateExpression("upper(text)", scope)).toBe("HELLO");
    expect(evaluateExpression("lower(text)", scope)).toBe("hello");
    expect(evaluateExpression("trim(\"  hi  \" )", scope)).toBe("hi");
    expect(evaluateExpression("replace(text, \"l\", \"x\")", scope)).toBe("Hexxo");
    expect(evaluateExpression("pos(text, \"el\")", scope)).toBe(2);
    expect(evaluateExpression("left(text, 2)", scope)).toBe("He");
    expect(evaluateExpression("right(text, 2)", scope)).toBe("lo");
    expect(evaluateExpression("mid(text, 2, 3)", scope)).toBe("ell");
    expect(evaluateExpression("nvl(name, \"unknown\")", scope)).toBe("unknown");
    expect(evaluateExpression("sum(nums)", scope)).toBe(6);
    expect(evaluateExpression("avg(nums)", scope)).toBeCloseTo(2);
  });

  test("datetime helpers", () => {
    const d = new Date("2024-01-01T00:00:00Z");
    const s = { d };
    expect(evaluateExpression("format(d, \"date\")", s)).toBe("2024-01-01");
    expect(typeof evaluateExpression("now()", s)).toBe("object");
    expect(evaluateExpression("datediff(dateadd(d, 1), d)", s)).toBeCloseTo(1);
    expect(evaluateExpression("year(d)", s)).toBe(2024);
    expect(evaluateExpression("month(d)", s)).toBe(1);
    expect(evaluateExpression("day(d)", s)).toBe(1);
    expect(evaluateExpression("hour(d)", s)).toBe(0);
    expect(evaluateExpression("minute(d)", s)).toBe(0);
    expect(evaluateExpression("second(d)", s)).toBe(0);
    const built = evaluateExpression("datetime(2024, 2, 3, 4, 5, 6)", s) as Date;
    expect(built.getFullYear()).toBe(2024);
    expect(built.getMonth()).toBe(1);
    expect(built.getDate()).toBe(3);
    expect(built.getHours()).toBe(4);
    expect(built.getMinutes()).toBe(5);
    expect(built.getSeconds()).toBe(6);
  });

  test("compiled expression reuse", () => {
    const compiled = compileExpression("a * b + len(text)");
    expect(compiled.evaluate(scope)).toBe(15);
    expect(compiled.evaluate({ a: 1, b: 10, text: "abc" })).toBe(13);
  });
});
