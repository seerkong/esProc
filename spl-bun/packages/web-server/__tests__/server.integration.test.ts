import { describe, expect, test } from "bun:test";
import { apiRoutes, type ExecuteRequest } from "@esproc/web-shared";
import { app } from "../src/server";

async function postExecute(expressions: ExecuteRequest) {
  const res = await app.handle(
    new Request(`http://localhost${apiRoutes.execute}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expressions),
    })
  );
  expect(res.status).toBe(200);
  return res.json();
}

describe("web-server DSL execution (sqlite integration)", () => {
  test("executes multi-step demo.query against sqlite", async () => {
    const result = await postExecute([
      { row: 1, col: "A", expr: `demo.query("select * from AREA limit 1")` },
      { row: 2, col: "A", expr: `demo.query("select * from AREA limit 2")` },
    ]);
    expect(result.status).toBe("ok");
    expect(result.steps.length).toBe(2);
    expect(result.steps[0].status).toBe("ok");
    expect(result.steps[1].status).toBe("ok");
    expect(result.data.columns).toContain("AREAID");
    expect(result.data.rows.length).toBe(2);
  });

  test("supports parameter binding in demo.query", async () => {
    const result = await postExecute([
      { row: 1, col: "A", expr: `demo.query("select AREANAME from AREA where AREAID = ?", 10)` },
      { row: 2, col: "A", expr: `demo.query("select AREANAME from AREA where AREAID = ?", 11)` },
    ]);
    expect(result.status).toBe("ok");
    expect(result.steps[0].data.rows[0]?.AREANAME?.trim()).toBe("HuNan");
    expect(result.data.rows[0]?.AREANAME?.trim()).toBe("FuJian");
  });

  test("allows referencing previous step result via cell ref", async () => {
    const result = await postExecute([
      { row: 1, col: "A", expr: `demo.query("select * from AREA limit 3")` },
      { row: 2, col: "A", expr: "A1.count()" },
    ]);
    expect(result.status).toBe("ok");
    expect(result.steps[1].value).toBe(3);
  });

  test("returns error for unknown connection", async () => {
    const result = await postExecute([{ row: 1, col: "A", expr: `unknown.query("select 1")` }]);
    expect(result.status).toBe("error");
    expect(result.steps?.[0].status).toBe("error");
    expect(String(result.error)).toContain("Connection 'unknown' not found");
  });
});
