import { describe, expect, test } from "bun:test";
import { compileDSL, parseDSL } from "../src";

describe("spl-dsl parsing and evaluation", () => {
  test("parses sql shortcut", () => {
    const node = parseDSL(`$q("select * from t")`);
    expect(node.type).toBe("sql");
    expect(node.expression).toContain("select");
  });

  test("parses member call with sql", () => {
    const node = parseDSL(`demo.query("select * from STATES")`);
    expect(node.type).toBe("memberCall");
    if (node.type !== "memberCall") return;
    expect(node.object).toBe("demo");
    expect(node.method).toBe("query");
    expect(node.args[0]).toBe("select * from STATES");
  });

  test("parses member call with parameters", () => {
    const node = parseDSL(`db.query("select * from users where id = ?", userId, status)`);
    expect(node.type).toBe("memberCall");
    if (node.type !== "memberCall") return;
    expect(node.args).toEqual(["select * from users where id = ?", "userId", "status"]);
  });

  test("evaluates member call on scoped result (count)", async () => {
    const compiled = compileDSL(`A1.count()`);
    const result = await compiled.evaluate({
      scope: { A1: { columns: ["AREAID"], rows: [{ AREAID: 1 }, { AREAID: 2 }] } },
    });
    expect(result).toBe(2);
  });

  test("parses global connect", () => {
    const node = parseDSL(`connect("demo")`);
    expect(node.type).toBe("globalCall");
    if (node.type !== "globalCall") return;
    expect(node.function).toBe("connect");
    expect(node.args).toEqual(["demo"]);
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
    const calls: any[] = [];
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

  test("evaluates member call query with connection and params", async () => {
    const calls: any[] = [];
    const compiled = compileDSL(`demo.query("select * from t where id = ?", userId)`);
    const connections = new Map([["demo", { name: "demo", type: "sqlite" }]]);
    await compiled.evaluate({
      connections,
      scope: { userId: 7 },
      adapters: { sqliteQuery: (opts) => calls.push(opts) },
    });
    expect(calls.length).toBe(1);
    expect(calls[0].connection?.name).toBe("demo");
    expect(calls[0].sql).toBe("select * from t where id = ?");
    expect(calls[0].params).toEqual([7]);
  });

  test("throws on unknown connection", async () => {
    const compiled = compileDSL(`unknown.query("select 1")`);
    await expect(
      compiled.evaluate({
        connections: new Map(),
        adapters: { sqliteQuery: () => null },
      })
    ).rejects.toThrow("Connection 'unknown' not found");
  });

  test("connect global function resolves registered connection", async () => {
    const compiled = compileDSL(`connect("demo")`);
    const connections = new Map([["demo", { name: "demo", type: "sqlite" }]]);
    const result = await compiled.evaluate({ connections });
    expect(result).toEqual({ name: "demo", type: "sqlite" });
  });

  test("connect with driver and url returns jdbc connection reference", async () => {
    const compiled = compileDSL(`connect("org.sqlite.JDBC", "jdbc:sqlite:demo.db")`);
    const result = await compiled.evaluate({});
    expect(result).toEqual({ name: "jdbc:sqlite:demo.db", type: "jdbc", driver: "org.sqlite.JDBC", url: "jdbc:sqlite:demo.db" });
  });
});
