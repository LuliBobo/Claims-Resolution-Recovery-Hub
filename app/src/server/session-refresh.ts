import type { UserRole } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** Current role of the user behind a session token, or null when the user no longer exists. */
export async function refreshRole(userId: string | undefined): Promise<UserRole | null> {
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}
