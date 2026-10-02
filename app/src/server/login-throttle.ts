import { db } from "@/server/db";

// Throttles password guessing: after MAX_FAILURES failed sign-ins for one email within WINDOW_MS,
// further attempts for that email are refused (even with the right password) until the window
// passes. Per email, not per IP, so an attacker can temporarily lock out a known address; that is
// the accepted trade-off for a prototype (and failures for unknown emails are counted the same way,
// so the response does not reveal whether an account exists).

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function isLoginThrottled(email: string, now = new Date()): Promise<boolean> {
  const failures = await db.loginAttempt.count({
    where: { email, success: false, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
  });
  return failures >= MAX_FAILURES;
}

export async function recordLoginAttempt(email: string, success: boolean, now = new Date()) {
  await db.loginAttempt.create({ data: { email, success, createdAt: now } });
  // Opportunistic cleanup keeps the table small without a scheduled job.
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
}

/**
 * Reserve-then-verify: the attempt is recorded as a failure BEFORE the (slow) password check, and the
 * window is counted including this attempt. Parallel guesses therefore see each other, so at most
 * MAX_FAILURES of them are ever evaluated. Returns null when throttled. Call `finishLoginAttempt`
 * with the outcome; an attempt that never finishes (crash) stays counted as a failure.
 */
export async function beginLoginAttempt(email: string, now = new Date()): Promise<{ id: string } | null> {
  const row = await db.loginAttempt.create({ data: { email, success: false, createdAt: now } });
  const failures = await db.loginAttempt.count({
    where: { email, success: false, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
  });
  if (failures > MAX_FAILURES) return null;
  return { id: row.id };
}

export async function finishLoginAttempt(attempt: { id: string }, success: boolean, now = new Date()) {
  if (success) await db.loginAttempt.update({ where: { id: attempt.id }, data: { success: true } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
}
