import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "packages/web-ide/__tests__/e2e",
  // Keep Playwright e2e tests out of Bun's default `*.spec.ts` discovery.
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4174",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  webServer: [
    {
      command: "bun run dev:backend",
      url: "http://localhost:4176/api/health",
      // Backend must not be re-used, otherwise local/manual DB mutations can leak into e2e.
      reuseExistingServer: false,
      env: {
        // Use an ignored, throwaway DB for e2e and rebuild it each run.
        SPL_DEMO_DB_PATH: "data/out/demo.e2e.db",
        SPL_DEMO_DB_RESET: "1",
      },
      timeout: 60_000,
    },
    {
      command: "bun run dev:frontend",
      url: "http://localhost:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
