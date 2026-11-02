import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    {
      name: "PC",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "Tablet",
      use: {
        browserName: "chromium",
        viewport: { width: 834, height: 1194 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "Celular",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_INSFORGE_URL: "https://acemar-test.invalid",
      VITE_INSFORGE_ANON_KEY: "test-only-public-key",
    },
  },
});
