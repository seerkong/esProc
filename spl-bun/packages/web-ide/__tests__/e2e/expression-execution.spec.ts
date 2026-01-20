import { test, expect } from "@playwright/test";
import { startBackend, startFrontend, waitForDemoLoad, selectDemo, runSheet, getGridData } from "./helpers";

test.beforeAll(async () => {
  await startBackend();
  await startFrontend();
});

test("runs sequence demos and returns rows", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await selectDemo(page, "Sequence Select");
  await runSheet(page);
  const selectGrid = await getGridData(page);
  expect(selectGrid.rows.length).toBeGreaterThan(0);

  await selectDemo(page, "Sequence Sort");
  await runSheet(page);
  const sortGrid = await getGridData(page);
  expect(sortGrid.rows.length).toBeGreaterThan(0);
});

test("runs file demos and returns rows", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await selectDemo(page, "CSV Import");
  await runSheet(page);
  const csvGrid = await getGridData(page);
  expect(csvGrid.columns).toContain("region");
  expect(csvGrid.rows.length).toBeGreaterThan(0);

  await selectDemo(page, "JSON Processing");
  await runSheet(page);
  const jsonGrid = await getGridData(page);
  expect(jsonGrid.columns).toContain("label");
  expect(jsonGrid.rows.length).toBeGreaterThan(0);
});

test("runs cursor demo and returns rows", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await selectDemo(page, "Cursor Pagination");
  await runSheet(page);
  const cursorGrid = await getGridData(page);
  expect(cursorGrid.rows.length).toBeGreaterThan(0);
});
