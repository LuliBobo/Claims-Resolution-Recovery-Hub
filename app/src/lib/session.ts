import { cache } from "react";
import { auth } from "@/auth";
import { requireRole, type Actor } from "@/server/auth";
import type { UserRole } from "@/generated/prisma/client";

// Cached per request: each auth() call re-reads the role from the database.
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role,
  };
});

/** For Server Actions / route handlers: resolves the session actor and enforces role. */
export async function requireActorRole(...allowed: UserRole[]): Promise<Actor> {
  return requireRole(await getActor(), ...allowed);
}
