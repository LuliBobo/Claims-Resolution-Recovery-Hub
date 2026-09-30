import { timingSafeEqual } from "node:crypto";

/**
 * Cron endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it when the
 * CRON_SECRET env var is set). Fails closed: with no secret configured nothing is authorized.
 */
export function isAuthorizedCron(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
