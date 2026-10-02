import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Serverless: every function instance keeps its own pool, so keep it small and point DATABASE_URL
// at a pooled endpoint (PgBouncer/Neon/Supabase pooler). Transaction-mode pooling is fine here: all
// locks used (SELECT ... FOR UPDATE, pg_advisory_xact_lock) are transaction-scoped.
export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
  });
}

// Created on first use, not at import: `next build` imports every route module, and a build (for
// example a Preview deployment) must not fail just because no database is configured.
let client: PrismaClient | undefined;
function getClient(): PrismaClient {
  client ??= globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = getClient();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
