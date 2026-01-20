import { test, expect } from "@playwright/test";
import { startBackend, startFrontend, waitForDemoLoad, selectDemo, runSheet, getGridData } from "./helpers";

test.beforeAll(async () => {
  await startBackend();
  await startFrontend();
});

test("runs multi-source query demo", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await selectDemo(page, "Multi-Source Query");
  await runSheet(page);
  const grid = await getGridData(page);
  expect(grid.rows.length).toBeGreaterThan(0);
});

test("runs cross-datasource join demo", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await selectDemo(page, "Cross-Datasource Join");
  await runSheet(page);
  const grid = await getGridData(page);
  expect(grid.columns.some((col) => col.includes("cust_"))).toBe(true);
});
