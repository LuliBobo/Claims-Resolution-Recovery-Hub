import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type UserRole } from "../src/generated/prisma/client";

// Creates (or updates the role and password of) one user. Usage:
//   NEW_USER_PASSWORD='...' npm run user:create -- you@company.com "Your Name" admin
// The password comes from the environment, not argv, so it stays out of shell history and process
// lists. If NEW_USER_PASSWORD is unset a strong random one is generated and printed once.

const [email, name, role] = process.argv.slice(2);
const ROLES: UserRole[] = ["agent", "reviewer", "admin"];
if (!email || !name || !ROLES.includes(role as UserRole)) {
  console.error('Usage: npm run user:create -- <email> "<name>" <agent|reviewer|admin>');
  process.exit(1);
}
const given = process.env.NEW_USER_PASSWORD; // empty counts as unset
const generated = !given;
const password = given || randomBytes(15).toString("base64url");
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: { name, role: role as UserRole, passwordHash },
      create: { email: email.toLowerCase(), name, role: role as UserRole, passwordHash },
    });
    console.log(`${user.email} is now ${user.role}.`);
    if (generated) console.log(`Generated password (shown once): ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
