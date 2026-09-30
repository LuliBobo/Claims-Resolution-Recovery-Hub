import { describe, expect, it } from "vitest";
import { proposalLabel } from "@/lib/proposal-label";

const d = new Date("2026-09-30T10:00:00Z");
describe("proposalLabel", () => {
  it("marks the pointed-at proposal Current", () => {
    expect(proposalLabel({ id: "a", status: "pending_approval", approvals: [] }, "a").badge).toBe("Current");
    expect(proposalLabel({ id: "b", status: "pending_approval", approvals: [] }, "a").badge).toBeNull();
  });
  it("explains a superseded proposal whose approval was decided", () => {
    const l = proposalLabel({ id: "a", status: "superseded", approvals: [{ decision: "approved", reviewer: "r@x.io", decisionTime: d }] }, "z");
    expect(l.badge).toBe("Superseded");
    expect(l.text).toBe("Superseded: approved by r@x.io on 2026-09-30, replaced before being sent");
  });
  it("distinguishes a superseded proposal with no recorded decision, and never says rejected for it", () => {
    const l = proposalLabel({ id: "a", status: "superseded", approvals: [{ decision: "superseded", reviewer: null, decisionTime: null }] }, "z");
    expect(l.text).toBe("Superseded: no decision was recorded before it was replaced");
    expect(l.text).not.toMatch(/rejected/);
  });
});
