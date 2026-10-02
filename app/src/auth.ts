import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { isLoginThrottled, recordLoginAttempt } from "@/server/login-throttle";

// Compared against when the email is unknown, so response time does not reveal which accounts exist.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Credentials provider forces JWT sessions, so no Session/Account tables (and no
// Prisma adapter) are needed; the User table is looked up directly.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        if (await isLoginThrottled(email)) return null;
        const user = await db.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? getDummyHash());
        await recordLoginAttempt(email, Boolean(user) && ok);
        if (!user || !ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: UserRole }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
