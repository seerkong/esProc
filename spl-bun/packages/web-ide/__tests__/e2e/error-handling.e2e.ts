import { test, expect } from "@playwright/test";
import { startBackend, startFrontend, waitForDemoLoad, runSheet } from "./helpers";

test.beforeAll(async () => {
  await startBackend();
  await startFrontend();
});

test("shows error for invalid expression", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await page.waitForFunction(() => {
    const w = window as unknown as { __SPL_UNIVER__?: { workbook?: any } };
    return Boolean(w.__SPL_UNIVER__?.workbook);
  });

  const a1Value = await page.evaluate(() => {
    const w = window as unknown as { __SPL_UNIVER__?: { workbook: any } };
    const wb = w.__SPL_UNIVER__!.workbook;
    const sheet = wb.getActiveSheet();
    sheet.getRange(0, 0).setValue('unknown.query("select 1")');
    sheet.getRange(1, 0).setValue("");
    return sheet.getRange(0, 0).getValue();
  });

  expect(String(a1Value)).toContain("unknown.query");
  await runSheet(page, "error");
});
