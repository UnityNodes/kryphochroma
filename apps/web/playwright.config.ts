import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? "3310");

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: `pnpm exec next start -p ${port}`, port, reuseExistingServer: true },
});
