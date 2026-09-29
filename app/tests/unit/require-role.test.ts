import { describe, expect, it } from "vitest";
import { AuthError, requireRole, REVIEW_ROLES, ADMIN_ONLY, type Actor } from "@/server/auth";

const actor = (role: Actor["role"]): Actor => ({ id: "u", email: "u@x.io", name: "U", role });

describe("requireRole", () => {
  it("rejects unauthenticated callers", () => {
    expect(() => requireRole(null, "agent")).toThrowError(AuthError);
  });
  it("lets reviewers and admins approve, not agents", () => {
    expect(requireRole(actor("reviewer"), ...REVIEW_ROLES).role).toBe("reviewer");
    expect(requireRole(actor("admin"), ...REVIEW_ROLES).role).toBe("admin");
    expect(() => requireRole(actor("agent"), ...REVIEW_ROLES)).toThrowError(/Requires role/);
  });
  it("restricts admin-only actions to admin", () => {
    expect(() => requireRole(actor("reviewer"), ...ADMIN_ONLY)).toThrowError(AuthError);
    expect(requireRole(actor("admin"), ...ADMIN_ONLY).role).toBe("admin");
  });
});
