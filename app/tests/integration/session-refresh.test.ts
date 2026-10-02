import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { refreshRole } from "@/server/session-refresh";

const email = "session-refresh@test.io";
afterEach(async () => {
  await db.user.deleteMany({ where: { email } });
});

describe("refreshRole", () => {
  it("reflects a role change and a deletion immediately", async () => {
    const u = await db.user.create({ data: { email, name: "S", role: "reviewer", passwordHash: "x" } });
    expect(await refreshRole(u.id)).toBe("reviewer");
    await db.user.update({ where: { id: u.id }, data: { role: "agent" } });
    expect(await refreshRole(u.id)).toBe("agent");
    await db.user.delete({ where: { id: u.id } });
    expect(await refreshRole(u.id)).toBeNull();
    expect(await refreshRole(undefined)).toBeNull();
  });
});
