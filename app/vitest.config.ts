import path from "node:path";
import "dotenv/config";
import { defineConfig } from "vitest/config";

// Tests always run against the separate test database, never DATABASE_URL.
const testDbUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://claims:claims@localhost:5432/claims_hub_test?schema=public";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: { DATABASE_URL: testDbUrl },
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
  },
});
