import { test, expect } from "@playwright/test";
import { startBackend, startFrontend, waitForDemoLoad, selectDemo } from "./helpers";

test.beforeAll(async () => {
  await startBackend();
  await startFrontend();
});

test("loads demo list and switches demos", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  const options = await page.locator("#demoSelect option").allTextContents();
  expect(options.length).toBeGreaterThan(8);

  await selectDemo(page, "Data Pipeline");
  await expect(page.locator(".toolbar .status")).toContainText("Data Pipeline");

  await selectDemo(page, "CSV Import");
  await expect(page.locator(".toolbar .status")).toContainText("CSV Import");
});
