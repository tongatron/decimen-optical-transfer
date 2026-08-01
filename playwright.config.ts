import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "https://127.0.0.1:5173",
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "https://127.0.0.1:5173",
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
