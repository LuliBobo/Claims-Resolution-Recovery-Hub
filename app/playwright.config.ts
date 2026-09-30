import { defineConfig } from "@playwright/test";

// E2E runs against its own database (created and reset in tests/e2e/global-setup.ts) and a
// production build, with the fake LLM enabled. It never touches DATABASE_URL.
export const E2E_DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://claims:claims@localhost:5432/claims_hub_e2e?schema=public";
const PORT = 3200;
process.env.DATABASE_URL = E2E_DB_URL; // for the fixtures imported by the tests

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DB_URL,
      E2E_FAKE_LLM: "1",
      AUTH_SECRET: "e2e-only-secret",
      AUTH_TRUST_HOST: "true",
    },
  },
});
