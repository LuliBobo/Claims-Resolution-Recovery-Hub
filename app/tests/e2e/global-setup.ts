import { execSync } from "node:child_process";
import { Client } from "pg";

// Recreates the E2E database from scratch: migrations + users, policies and rules (no sample cases).
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://claims:claims@localhost:5432/claims_hub_e2e?schema=public";
  const admin = new URL(url);
  const dbName = admin.pathname.slice(1);
  admin.pathname = "/postgres";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query("select 1 from pg_database where datname = $1", [dbName]);
  if (exists.rowCount === 0) await c.query(`create database "${dbName}"`);
  await c.end();

  const db = new Client({ connectionString: url });
  await db.connect();
  await db.query("drop schema public cascade; create schema public;");
  await db.end();

  const env = { ...process.env, DATABASE_URL: url, SEED_SKIP_SAMPLES: "1" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx prisma db seed", { env, stdio: "pipe" });
}
