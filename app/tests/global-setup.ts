import { execSync } from "node:child_process";

// Applies migrations to the test database once per run (idempotent).
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://claims:claims@localhost:5432/claims_hub_test?schema=public";
  try {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  } catch (e) {
    const out = (e as { stderr?: Buffer }).stderr?.toString() ?? "";
    // Unit-only environments without Postgres should still run the pure tests.
    console.warn(`[tests] could not migrate test DB; integration tests will fail.\n${out}`);
  }
}
