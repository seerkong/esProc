import { describe, expect, test } from "bun:test";
import { compileDSL, parseDSL } from "../src";
describe("spl-dsl parsing and evaluation", () => {
    test("parses sql shortcut", () => {
        const node = parseDSL(`$q("select * from t")`);
        expect(node.type).toBe("sql");
        expect(node.expression).toContain("select");
    });
    test("parses if return pattern", () => {
        const node = parseDSL("if a > 1 return b");
        expect(node.type).toBe("if");
        expect(node.condition).toBe("a > 1");
        expect(node.thenExpression).toBe("b");
    });
    test("evaluates expression with refs", async () => {
        const compiled = compileDSL("a + b");
        const result = await compiled.evaluate({ scope: { a: 2, b: 3 } });
        expect(result).toBe(5);
    });
    test("evaluates if with else", async () => {
        const compiled = compileDSL("if a > 1 then b else 0");
        const result = await compiled.evaluate({ scope: { a: 2, b: 10 } });
        expect(result).toBe(10);
        const result2 = await compiled.evaluate({ scope: { a: 0, b: 10 } });
        expect(result2).toBe(0);
    });
    test("runs sql via adapter", async () => {
        const calls = [];
        const compiled = compileDSL(`$q("select 1")`);
        await compiled.evaluate({
            adapters: { sqliteQuery: (opts) => calls.push(opts) },
            defaultDbPath: "db.sqlite",
            scope: { x: 1 },
        });
        expect(calls.length).toBe(1);
        expect(calls[0].sql).toContain("select");
        expect(calls[0].dbPath).toBe("db.sqlite");
    });
});
