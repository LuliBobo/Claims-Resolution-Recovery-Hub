import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { refreshRole } from "@/server/session-refresh";
import { beginLoginAttempt, finishLoginAttempt } from "@/server/login-throttle";

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
        const attempt = await beginLoginAttempt(email);
        if (!attempt) return null;
        const user = await db.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? getDummyHash());
        await finishLoginAttempt(attempt, Boolean(user) && ok);
        if (!user || !ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: UserRole }).role;
        return token;
      }
      // Re-read the role on every session read, so a demoted or deleted user loses access immediately
      // instead of keeping the role copied into the token at sign-in.
      const current = await refreshRole(token.id as string | undefined);
      if (!current) return null;
      token.role = current;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
