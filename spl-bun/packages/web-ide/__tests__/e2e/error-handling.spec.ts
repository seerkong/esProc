import { test, expect } from "@playwright/test";
import { startBackend, startFrontend, waitForDemoLoad, runSheet } from "./helpers";

test.beforeAll(async () => {
  await startBackend();
  await startFrontend();
});

test("shows error for invalid expression", async ({ page }) => {
  await page.goto("/");
  await waitForDemoLoad(page);

  await page.evaluate(() => {
    const target = document.querySelector(".univer-container") as HTMLElement | null;
    if (!target) return;
    const input = document.querySelector(".univer-editor-input") as HTMLInputElement | null;
    if (input) {
      input.value = "unknown.query(\"select 1\")";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  await runSheet(page);
  await expect(page.locator(".toolbar .status")).toContainText("Error:");
});
