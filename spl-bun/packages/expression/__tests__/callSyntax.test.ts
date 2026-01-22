/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { compileExpression } from "../src/index";

describe("call syntax extensions (SPL parity)", () => {
  test("parses function @ variants", () => {
    expect(() => compileExpression('T@c("./data/sales.csv")')).not.toThrow();
  });

  test("parses member @ variants", () => {
    expect(() => compileExpression('f.xlsimport@t(;"School1")')).not.toThrow();
  });

  test("parses semicolon argument groups in function calls", () => {
    expect(() => compileExpression('T("./out.xlsx", data; "School1")')).not.toThrow();
    expect(() => compileExpression('T("./out.xlsx"; "School1")')).not.toThrow();
  });
});
