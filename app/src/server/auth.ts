import type { UserRole } from "@/generated/prisma/client";

// Framework-agnostic authorization helpers. Session lookup lives in src/lib/session.ts
// so this layer never imports Next.js.

export interface Actor {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Throws unless `actor` is signed in and holds one of `allowed`. Returns the actor. */
export function requireRole(actor: Actor | null | undefined, ...allowed: UserRole[]): Actor {
  if (!actor) throw new AuthError("UNAUTHENTICATED", "Sign in required");
  if (!allowed.includes(actor.role)) {
    throw new AuthError("FORBIDDEN", `Requires role: ${allowed.join(" or ")}`);
  }
  return actor;
}

// Role sets used by mutating workflows (plan: Auth section).
export const ANY_ROLE: UserRole[] = ["agent", "reviewer", "admin"];
export const REVIEW_ROLES: UserRole[] = ["reviewer", "admin"];
export const ADMIN_ONLY: UserRole[] = ["admin"];
