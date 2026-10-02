import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { beginLoginAttempt, finishLoginAttempt, isLoginThrottled, MAX_FAILURES, recordLoginAttempt, WINDOW_MS } from "@/server/login-throttle";

const emails = ["throttle-a@test.io", "throttle-b@test.io"];
afterEach(async () => {
  await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
});

describe("login throttle", () => {
  it("locks an email after MAX_FAILURES failures, even for a later correct password", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await recordLoginAttempt(emails[0], false);
    expect(await isLoginThrottled(emails[0])).toBe(false);
    await recordLoginAttempt(emails[0], false);
    expect(await isLoginThrottled(emails[0])).toBe(true);
    await recordLoginAttempt(emails[0], true); // a success does not lift the lock inside the window
    expect(await isLoginThrottled(emails[0])).toBe(true);
  });

  it("successes do not count as failures, and emails are independent", async () => {
    for (let i = 0; i < MAX_FAILURES + 2; i++) await recordLoginAttempt(emails[0], true);
    expect(await isLoginThrottled(emails[0])).toBe(false);
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginAttempt(emails[1], false);
    expect(await isLoginThrottled(emails[1])).toBe(true);
    expect(await isLoginThrottled(emails[0])).toBe(false);
  });

  it("the lock expires after the window", async () => {
    const t0 = new Date("2026-10-02T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginAttempt(emails[0], false, t0);
    expect(await isLoginThrottled(emails[0], new Date(t0.getTime() + WINDOW_MS - 1000))).toBe(true);
    expect(await isLoginThrottled(emails[0], new Date(t0.getTime() + WINDOW_MS + 1000))).toBe(false);
  });

  it("old attempts are cleaned up as new ones are recorded", async () => {
    await recordLoginAttempt(emails[0], false, new Date("2020-01-01T00:00:00Z"));
    await recordLoginAttempt(emails[0], false); // now
    expect(await db.loginAttempt.count({ where: { email: emails[0], createdAt: { lt: new Date("2021-01-01") } } })).toBe(0);
  });

  it("parallel guesses cannot exceed MAX_FAILURES evaluated attempts", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => beginLoginAttempt(emails[0])));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(MAX_FAILURES);
    for (const r of results) if (r) await finishLoginAttempt(r, false);
    expect(await beginLoginAttempt(emails[0])).toBeNull();
  });

  it("a successful attempt is not counted as a failure", async () => {
    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      const a = await beginLoginAttempt(emails[1]);
      expect(a).not.toBeNull();
      await finishLoginAttempt(a!, true);
    }
  });
});
