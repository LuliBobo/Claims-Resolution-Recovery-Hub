import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type UserRole } from "../src/generated/prisma/client";
import { SEED_POLICIES, SEED_RULES } from "../src/server/reference-data/seed-data";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Dev-only credentials. Override the shared password via SEED_PASSWORD.
const password = process.env.SEED_PASSWORD ?? "changeme-dev";

const USERS: { email: string; name: string; role: UserRole }[] = [
  { email: "agent@example.com", name: "Alex Agent", role: "agent" },
  { email: "reviewer@example.com", name: "Riley Reviewer", role: "reviewer" },
  { email: "admin@example.com", name: "Sam Admin", role: "admin" },
];

async function seedUsers() {
  const passwordHash = await bcrypt.hash(password, 10);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { ...u, passwordHash },
    });
  }
}

async function seedPoliciesAndRules() {
  const idByName = new Map<string, string>();
  for (const p of SEED_POLICIES) {
    const existing = await prisma.policyDocument.findFirst({ where: { name: p.name } });
    const row = existing ?? (await prisma.policyDocument.create({ data: { ...p } }));
    idByName.set(p.name, row.id);
  }
  for (const { policyName, ...r } of SEED_RULES) {
    const exists = await prisma.rule.findFirst({ where: { ruleName: r.ruleName } });
    if (!exists) {
      await prisma.rule.create({
        data: { ...r, linkedPolicyDocumentId: idByName.get(policyName) },
      });
    }
  }
}

async function main() {
  await seedUsers();
  await seedPoliciesAndRules();
  if (!process.env.SEED_SKIP_SAMPLES) {
    // Loaded lazily: this pulls in the app's workflow code and its own Prisma client.
    const { seedSampleData } = await import("../src/server/seed/sample-data");
    const r = await seedSampleData();
    console.log(`Sample data: ${r.cases} cases created, ${r.skippedExisting} already present, ${r.attachments} attachments (${r.skippedMissingEvidence} "missing" rows skipped).`);
    for (const w of r.warnings) console.warn(`  warning: ${w}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
