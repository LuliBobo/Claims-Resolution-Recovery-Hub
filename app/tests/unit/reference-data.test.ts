import { beforeAll, describe, expect, it } from "vitest";
import { orderInput, ruleInput, shipmentInput } from "@/lib/validation/reference-data";
import { CARRIER_CLAIMS_SOP_NAME, SEED_POLICIES, SEED_RULES } from "@/server/reference-data/seed-data";
import { AuthError, type Actor } from "@/server/auth";

const actor = (role: Actor["role"]): Actor => ({ id: "u", email: "u@x.io", name: "U", role });

describe("validation", () => {
  it("coerces form strings and blanks optional fields", () => {
    const o = orderInput.parse({
      orderDate: "2026-09-01", salesChannel: "web", customerName: "A", customerEmail: "",
      sku: "S1", productName: "P", quantity: "2", orderValue: "19.90",
    });
    expect(o.quantity).toBe(2);
    expect(o.customerEmail).toBeUndefined();
  });
  it("treats empty dates as absent and rejects bad ones", () => {
    const base = { linkedOrderId: "o", carrier: "DPD", trackingNumber: "T", deliveryStatus: "pending" };
    expect(shipmentInput.parse({ ...base, shipDate: "" }).shipDate).toBeUndefined();
    expect(() => shipmentInput.parse({ ...base, shipDate: "nope" })).toThrow();
  });
  it("parses checkbox values for rules", () => {
    const r = ruleInput.parse({ ruleName: "r", triggerType: "other", activeStatus: "on" });
    expect(r.activeStatus).toBe(true);
  });
});

describe("seed data", () => {
  it("matches Luo's verified counts and includes the exact-named SOP", () => {
    expect(SEED_POLICIES).toHaveLength(3);
    expect(SEED_RULES).toHaveLength(3);
    expect(SEED_POLICIES.map((p) => p.name)).toContain(CARRIER_CLAIMS_SOP_NAME);
    const names = new Set<string>(SEED_POLICIES.map((p) => p.name));
    for (const r of SEED_RULES) expect(names.has(r.policyName)).toBe(true);
  });
});

describe("role gating (rejects before touching the DB)", () => {
  let ref: typeof import("@/server/reference-data");
  beforeAll(async () => {
    process.env.DATABASE_URL ??= "postgresql://x:x@localhost:1/x";
    ref = await import("@/server/reference-data");
  });
  it("blocks unauthenticated order creation", async () => {
    await expect(ref.createOrder(null, {})).rejects.toBeInstanceOf(AuthError);
  });
  it("blocks agents from editing policies and rules", async () => {
    await expect(ref.createPolicyDocument(actor("agent"), {})).rejects.toBeInstanceOf(AuthError);
    await expect(ref.setRuleActive(actor("agent"), "id", false)).rejects.toBeInstanceOf(AuthError);
  });
});
