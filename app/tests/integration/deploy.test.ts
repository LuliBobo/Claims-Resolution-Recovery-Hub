import { execFileSync } from "node:child_process";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { GET as health } from "@/app/api/health/route";

const req = (auth?: string) => new Request("http://x/api/health", { headers: auth ? { authorization: auth } : {} });
const saved = { ...process.env };
beforeEach(() => {
  process.env.AUTH_SECRET = "s";
  delete process.env.E2E_FAKE_LLM;
  process.env.CRON_SECRET = "cron-secret";
});
afterEach(() => {
  process.env = { ...saved };
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "deploytest-" } } });
  await db.$disconnect();
});

describe("/api/health", () => {
  it("is ok when the database and secrets are present, and public output is minimal", async () => {
    const r = await health(req());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok", database: true });
  });
  it("lists configuration booleans (never values) only with the bearer token", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-secret-value";
    const r = await health(req("Bearer cron-secret"));
    const text = await r.text();
    const checks = JSON.parse(text).checks;
    expect(checks).toMatchObject({ database: true, authSecret: true, cronSecret: true, anthropicKey: true, fakeLlmOff: true });
    expect(typeof checks.carrierGateActive).toBe("boolean");
    expect(text).not.toContain("sk-secret-value");
    expect(text).not.toContain("cron-secret");
  });
  it("is degraded (503) without AUTH_SECRET or with the fake LLM switched on", async () => {
    delete process.env.AUTH_SECRET;
    expect((await health(req())).status).toBe(503);
    process.env.AUTH_SECRET = "s";
    process.env.E2E_FAKE_LLM = "1";
    expect((await health(req())).status).toBe(503);
  });
});

describe("scripts/create-user.ts", () => {
  const run = (args: string[], env: Record<string, string>) =>
    execFileSync("npx", ["tsx", "scripts/create-user.ts", ...args], { env: { ...process.env, ...env }, encoding: "utf-8", stdio: "pipe" });

  it("creates a user with a hashed password, then updates role and password in place", async () => {
    const email = "deploytest-admin@test.io";
    run([email, "Deploy Test", "reviewer"], { NEW_USER_PASSWORD: "a-long-first-password" });
    let u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u.role).toBe("reviewer");
    expect(u.passwordHash).not.toContain("a-long-first-password");
    expect(await bcrypt.compare("a-long-first-password", u.passwordHash)).toBe(true);

    run([email.toUpperCase(), "Deploy Test", "admin"], { NEW_USER_PASSWORD: "a-long-second-password" });
    u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u.role).toBe("admin");
    expect(await bcrypt.compare("a-long-second-password", u.passwordHash)).toBe(true);
    expect(await db.user.count({ where: { email: { startsWith: "deploytest-" } } })).toBe(1);
  });

  it("generates and prints a strong password once when none is given", async () => {
    const out = run(["deploytest-gen@test.io", "Gen", "agent"], { NEW_USER_PASSWORD: "" });
    const pw = /Generated password \(shown once\): (\S+)/.exec(out)?.[1];
    expect(pw?.length).toBeGreaterThanOrEqual(20);
    const u = await db.user.findUniqueOrThrow({ where: { email: "deploytest-gen@test.io" } });
    expect(await bcrypt.compare(pw!, u.passwordHash)).toBe(true);
  });

  it("rejects short passwords, unknown roles and missing arguments", () => {
    expect(() => run(["deploytest-x@test.io", "X", "admin"], { NEW_USER_PASSWORD: "short" })).toThrow();
    expect(() => run(["deploytest-x@test.io", "X", "superuser"], { NEW_USER_PASSWORD: "a-long-enough-password" })).toThrow();
    expect(() => run([], {})).toThrow();
  });
});
