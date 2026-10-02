import { db } from "@/server/db";

// Throttles password guessing: after MAX_FAILURES failed sign-ins for one email within WINDOW_MS,
// further attempts for that email are refused (even with the right password) until the oldest
// failure leaves the window. Per email, not per IP, so an attacker can temporarily lock out a known address; that is
// the accepted trade-off for a prototype (and failures for unknown emails are counted the same way,
// so the response does not reveal whether an account exists).

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Reserve-then-verify: the attempt is recorded as a failure BEFORE the (slow) password check, and the
 * window is counted including this attempt. Parallel guesses therefore see each other, so at most
 * MAX_FAILURES of them are ever evaluated. Returns null when throttled. Accepted costs: a legitimate
 * sign-in racing a second one while the account sits at the limit can be refused, and an attempt
 * that crashes before `finishLoginAttempt` stays counted as a failure. Call `finishLoginAttempt`
 * with the outcome; an attempt that never finishes (crash) stays counted as a failure.
 */
export async function beginLoginAttempt(email: string, now = new Date()): Promise<{ id: string } | null> {
  const row = await db.loginAttempt.create({ data: { email, success: false, createdAt: now } });
  const failures = await db.loginAttempt.count({
    where: { email, success: false, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
  });
  if (failures > MAX_FAILURES) {
    // A refused attempt is not a failed guess: drop its row so refusals never extend the lockout.
    await db.loginAttempt.delete({ where: { id: row.id } });
    return null;
  }
  return { id: row.id };
}

export async function finishLoginAttempt(attempt: { id: string }, success: boolean, now = new Date()) {
  if (success) await db.loginAttempt.update({ where: { id: attempt.id }, data: { success: true } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
}
