import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type UserRole } from "../src/generated/prisma/client";

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

async function main() {
  await seedUsers();
  // M2/M8: policies + rules, then Orders/Shipments/Cases/Attachments from CSVs, then
  // proposals/approvals/drafts/audit events driven through the real workflow functions.
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
