import { expect, type Page } from "@playwright/test";

const backendUrl = "http://localhost:4176/api/health";
const frontendUrl = "http://localhost:4174";

/**
 * Wait for backend health endpoint to respond.
 */
export async function startBackend(): Promise<void> {
  await expect.poll(
    async () => {
      const res = await fetch(backendUrl);
      return res.ok ? "ok" : "down";
    },
    { timeout: 60_000 }
  ).toBe("ok");
}

/**
 * Wait for frontend base URL to respond.
 */
export async function startFrontend(): Promise<void> {
  await expect.poll(
    async () => {
      const res = await fetch(frontendUrl);
      return res.ok ? "ok" : "down";
    },
    { timeout: 60_000 }
  ).toBe("ok");
}

/**
 * No-op cleanup: Playwright webServer manages processes.
 */
export async function stopServices(): Promise<void> {
  // Playwright config owns webServer lifecycle; nothing to stop here.
}

/**
 * Wait for demo dropdown and result grid to render.
 */
export async function waitForDemoLoad(page: Page): Promise<void> {
  await page.waitForSelector("#demoSelect");
  await page.waitForSelector(".ag-grid-container");
}

/**
 * Select a demo by its label text.
 */
export async function selectDemo(page: Page, demoLabel: string): Promise<void> {
  await page.selectOption("#demoSelect", { label: demoLabel });
  await page.click(".demo-controls .load-btn");
  await expect(page.locator(".toolbar .status")).toContainText(demoLabel, { timeout: 10_000 });
}

/**
 * Run the active sheet and wait for completion status.
 */
export async function runSheet(page: Page): Promise<void> {
  await page.click("button:has-text(\"Run Sheet\")");
  await expect(page.locator(".toolbar .status")).toContainText("Done", { timeout: 15_000 });
}

/**
 * Extract AG Grid headers and row cell text.
 */
export async function getGridData(page: Page): Promise<{ rows: string[][]; columns: string[] }> {
  await page.waitForSelector(".ag-grid-container .ag-root-wrapper");
  const columns = await page
    .locator(".ag-header-cell-text")
    .allTextContents();
  const rows = await page
    .locator(".ag-center-cols-container .ag-row")
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll<HTMLElement>(".ag-cell")).map((cell) => cell.innerText.trim())
      )
    );
  return { columns: columns.map((col) => col.trim()).filter(Boolean), rows };
}
