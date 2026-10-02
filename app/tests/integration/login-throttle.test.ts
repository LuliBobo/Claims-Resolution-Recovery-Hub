import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { beginLoginAttempt, finishLoginAttempt, MAX_FAILURES, WINDOW_MS } from "@/server/login-throttle";

const emails = ["throttle-a@test.io", "throttle-b@test.io"];
afterEach(async () => {
  await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
});

const fail = async (email: string, now?: Date) => {
  const a = await beginLoginAttempt(email, now);
  if (a) await finishLoginAttempt(a, false, now);
  return a;
};

describe("login throttle", () => {
  it("locks an email after MAX_FAILURES failures, even for a later correct password", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) expect(await fail(emails[0])).not.toBeNull();
    expect(await beginLoginAttempt(emails[0])).toBeNull();
  });

  it("successes do not count as failures, and emails are independent", async () => {
    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      const a = await beginLoginAttempt(emails[0]);
      expect(a).not.toBeNull();
      await finishLoginAttempt(a!, true);
    }
    for (let i = 0; i < MAX_FAILURES; i++) await fail(emails[1]);
    expect(await beginLoginAttempt(emails[1])).toBeNull();
    expect(await beginLoginAttempt(emails[0])).not.toBeNull();
  });

  it("the lock expires after the window, and refused attempts do not extend it", async () => {
    const t0 = new Date("2026-10-02T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) await fail(emails[0], t0);
    const inside = (ms: number) => new Date(t0.getTime() + ms);
    expect(await beginLoginAttempt(emails[0], inside(WINDOW_MS - 60_000))).toBeNull();
    expect(await beginLoginAttempt(emails[0], inside(WINDOW_MS - 30_000))).toBeNull(); // repeated refusals
    expect(await db.loginAttempt.count({ where: { email: emails[0] } })).toBe(MAX_FAILURES); // none stored
    expect(await beginLoginAttempt(emails[0], inside(WINDOW_MS + 1000))).not.toBeNull();
  });

  it("old attempts are cleaned up as new ones finish", async () => {
    await db.loginAttempt.create({ data: { email: emails[0], success: false, createdAt: new Date("2020-01-01T00:00:00Z") } });
    await fail(emails[0]);
    expect(await db.loginAttempt.count({ where: { email: emails[0], createdAt: { lt: new Date("2021-01-01") } } })).toBe(0);
  });

  it("parallel guesses cannot exceed MAX_FAILURES evaluated attempts", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => beginLoginAttempt(emails[0])));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(MAX_FAILURES);
    for (const r of results) if (r) await finishLoginAttempt(r, false);
    // Refused attempts leave no row, so under contention fewer than MAX may have been evaluated; top up.
    const evaluated = results.filter(Boolean).length;
    for (let i = evaluated; i < MAX_FAILURES; i++) await fail(emails[0]);
    expect(await beginLoginAttempt(emails[0])).toBeNull();
  });
});
