import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import type { GeneratedProposal } from "@/server/llm/generate-proposal";
import { actionResolutionProposal } from "@/server/workflows/action-proposal";
import { createCase } from "@/server/workflows/case-intake";
import { ReconciliationRequiredError } from "@/server/workflows/proposal-generation";
import { describeCurrent, listCasesNeedingReconciliation } from "@/server/workflows/proposal-supersession";
import { reconcileLegacyCurrentProposal } from "@/server/workflows/reconcile-proposal";
import { regenerateResolutionProposal } from "@/server/workflows/regenerate-proposal";
import { ApprovalError, reviewApproval } from "@/server/workflows/review-approval";

const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };
const admin: Actor = { id: "ad", email: "admin@test.io", name: "Ad", role: "admin" };

const proposal: GeneratedProposal = {
  recommendation: "Replace item", rationale: "r", confidence: 0.8, customerImpact: "m",
  businessExposure: "m", policySource: "none", needsHumanApproval: true, customerReplyDraft: "hi",
};
// Small random delay widens the window in which concurrent calls interleave.
const slowDeps = {
  generate: async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 40));
    return proposal;
  },
};
const fastDeps = { generate: async () => proposal };
const llm = {
  summarize: async () => ({ customerLanguage: "en", internalEnglishSummary: "s" }),
  classify: async () => ({ caseType: "other" as const, priority: "low" as const, confidence: 0.5 }),
};

const caseIds: string[] = [];
beforeAll(async () => {
  process.env.UPLOAD_DIR = await mkdtemp(path.join(tmpdir(), "uploads-"));
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.$disconnect();
});

async function newCase() {
  const c = await createCase(agent, { source: "email", customerName: "Supersede Test", complaintText: "x" }, llm, fastDeps);
  caseIds.push(c.id);
  return c;
}
const live = (caseId: string) =>
  db.resolutionProposal.findMany({ where: { linkedCaseId: caseId, status: { in: ["pending_approval", "approved"] } } });
const pointer = async (caseId: string) => (await db.customerCase.findUniqueOrThrow({ where: { id: caseId } })).currentResolutionProposalId;
const approvalFor = (proposalId: string) => db.humanApproval.findFirstOrThrow({ where: { linkedResolutionProposalId: proposalId } });

describe("pointer and supersession", () => {
  it("the first proposal becomes current", async () => {
    const c = await newCase();
    const [p] = await live(c.id);
    expect(await pointer(c.id)).toBe(p.id);
  });

  it("regenerating supersedes a pending proposal and its still-pending approval", async () => {
    const c = await newCase();
    const [old] = await live(c.id);
    const { proposal: next } = await regenerateResolutionProposal(agent, c.id, fastDeps);
    expect(await pointer(c.id)).toBe(next.id);
    expect(await db.resolutionProposal.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "superseded" });
    const oldApproval = await approvalFor(old.id);
    expect(oldApproval.decision).toBe("superseded");
    expect(oldApproval.supersededAt).not.toBeNull();
    expect(oldApproval.decisionTime).toBeNull(); // decisionTime stays reserved for human decisions
  });

  it("never modifies a recorded human decision when superseding an approved proposal", async () => {
    const c = await newCase();
    const [old] = await live(c.id);
    const a = await approvalFor(old.id);
    const decided = await reviewApproval(reviewer, a.id, "approved", "fine");
    await regenerateResolutionProposal(agent, c.id, fastDeps);
    const after = await approvalFor(old.id);
    expect(after).toMatchObject({ decision: "approved", reviewer: "reviewer@test.io", reviewerComment: "fine", supersededAt: null });
    expect(after.decisionTime).toEqual(decided.decisionTime);
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("superseded"); // never "rejected"
  });

  it("leaves a rejected proposal and a sent proposal untouched", async () => {
    const rejected = await newCase();
    const [r] = await live(rejected.id);
    await reviewApproval(reviewer, (await approvalFor(r.id)).id, "rejected");
    await regenerateResolutionProposal(agent, rejected.id, fastDeps);
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("rejected");

    const sent = await newCase();
    const [s] = await live(sent.id);
    await reviewApproval(reviewer, (await approvalFor(s.id)).id, "approved");
    await actionResolutionProposal(agent, s.id);
    const { proposal: n } = await regenerateResolutionProposal(agent, sent.id, fastDeps);
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("sent");
    expect(await pointer(sent.id)).toBe(n.id);
  });

  it("the database refuses a pointer to another case's proposal", async () => {
    const a = await newCase();
    const b = await newCase();
    const [pb] = await live(b.id);
    await expect(db.customerCase.update({ where: { id: a.id }, data: { currentResolutionProposalId: pb.id } })).rejects.toThrow();
  });
});

describe("mark-sent guards", () => {
  it("rejects a superseded proposal with its own message, even if it was approved", async () => {
    const c = await newCase();
    const [old] = await live(c.id);
    await reviewApproval(reviewer, (await approvalFor(old.id)).id, "approved");
    await regenerateResolutionProposal(agent, c.id, fastDeps);
    await expect(actionResolutionProposal(agent, old.id)).rejects.toThrow(/superseded/);
  });

  it("rejects a live proposal that is not the current one (defense in depth)", async () => {
    const c = await newCase();
    const [cur] = await live(c.id);
    const stray = await db.resolutionProposal.create({ data: { linkedCaseId: c.id, recommendation: "x", rationale: "x", status: "approved" } });
    await expect(actionResolutionProposal(agent, stray.id)).rejects.toThrow(/not the current proposal/);
    expect(await pointer(c.id)).toBe(cur.id);
  });
});

describe("legacy and ambiguous cases", () => {
  async function legacyCase(n: number) {
    const c = await createCase(agent, { source: "email", customerName: "Legacy Test", complaintText: "x" }, llm, { generate: async () => { throw new Error("skip"); } });
    caseIds.push(c.id);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await db.resolutionProposal.create({ data: { linkedCaseId: c.id, recommendation: `opt ${i}`, rationale: "r" } });
      await db.humanApproval.create({ data: { linkedCaseId: c.id, approvalType: "resolution_proposal", linkedResolutionProposalId: p.id } });
      ids.push(p.id);
    }
    return { caseId: c.id, ids };
  }

  it("a sole live candidate with a NULL pointer is backfilled automatically when acted on", async () => {
    const { caseId, ids } = await legacyCase(1);
    expect((await describeCurrent(db, caseId)).currentId).toBe(ids[0]);
    await reviewApproval(reviewer, (await approvalFor(ids[0])).id, "approved");
    await actionResolutionProposal(agent, ids[0]);
    expect(await pointer(caseId)).toBe(ids[0]);
  });

  it("two or more live proposals stay ambiguous: sending and regenerating are hard-blocked", async () => {
    const { caseId, ids } = await legacyCase(3);
    expect(await pointer(caseId)).toBeNull();
    expect((await describeCurrent(db, caseId)).needsReconciliation).toBe(true);
    expect((await listCasesNeedingReconciliation()).map((r) => r.id)).toContain(caseId);
    await reviewApproval(reviewer, (await approvalFor(ids[0])).id, "approved");
    await expect(actionResolutionProposal(agent, ids[0])).rejects.toThrow(/reconcile/);
    await expect(regenerateResolutionProposal(agent, caseId, fastDeps)).rejects.toBeInstanceOf(ReconciliationRequiredError);
    expect(await pointer(caseId)).toBeNull(); // never silently picked
  });

  it("reconcile is admin-only, needs a comment, and supersedes the others per B.1", async () => {
    const { caseId, ids } = await legacyCase(3);
    await reviewApproval(reviewer, (await approvalFor(ids[1])).id, "approved"); // a recorded decision on a non-chosen one
    await expect(reconcileLegacyCurrentProposal(reviewer, caseId, ids[0], "because")).rejects.toBeInstanceOf(AuthError);
    await expect(reconcileLegacyCurrentProposal(admin, caseId, ids[0], "  ")).rejects.toBeInstanceOf(ApprovalError);

    await reconcileLegacyCurrentProposal(admin, caseId, ids[0], "Newest and matches the customer request");
    expect(await pointer(caseId)).toBe(ids[0]);
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: ids[0] } })).status).toBe("pending_approval");
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: ids[1] } })).status).toBe("superseded");
    expect((await approvalFor(ids[1])).decision).toBe("approved"); // untouched
    expect((await approvalFor(ids[2])).decision).toBe("superseded"); // was pending
    const ev = await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: caseId, action: "resolution_proposal_manually_reconciled" } });
    expect(ev.notes).toContain("Newest");
    await expect(reconcileLegacyCurrentProposal(admin, caseId, ids[0], "again")).rejects.toThrow(/already has a current/);
  });
});

// The hard gate for M6: Luo could never verify this. Real database, real concurrency.
describe("concurrency (M6 hard gate)", () => {
  it("two concurrent regenerations leave exactly one live proposal, and it is current", async () => {
    for (let round = 0; round < 5; round++) {
      const c = await newCase();
      await Promise.all([regenerateResolutionProposal(agent, c.id, slowDeps), regenerateResolutionProposal(agent, c.id, slowDeps)]);
      const liveNow = await live(c.id);
      expect(liveNow).toHaveLength(1);
      expect(await pointer(c.id)).toBe(liveNow[0].id);
      expect(await db.resolutionProposal.count({ where: { linkedCaseId: c.id } })).toBe(3);
      // every superseded proposal's pending approval was superseded with it
      const pendingOnDead = await db.humanApproval.count({
        where: { linkedCaseId: c.id, decision: "pending", resolutionProposal: { status: "superseded" } },
      });
      expect(pendingOnDead).toBe(0);
    }
  });

  it("eight concurrent regenerations still converge to one current proposal", async () => {
    const c = await newCase();
    await Promise.all(Array.from({ length: 8 }, () => regenerateResolutionProposal(agent, c.id, slowDeps)));
    const liveNow = await live(c.id);
    expect(liveNow).toHaveLength(1);
    expect(await pointer(c.id)).toBe(liveNow[0].id);
    expect(await db.resolutionProposal.count({ where: { linkedCaseId: c.id } })).toBe(9);
  });

  it("send racing regenerate: exactly one wins, and a sent proposal is never also superseded", async () => {
    for (let round = 0; round < 8; round++) {
      const c = await newCase();
      const [p0] = await live(c.id);
      await reviewApproval(reviewer, (await approvalFor(p0.id)).id, "approved");
      const [send, regen] = await Promise.allSettled([
        actionResolutionProposal(agent, p0.id),
        regenerateResolutionProposal(agent, c.id, slowDeps),
      ]);
      expect(regen.status).toBe("fulfilled");
      const final = await db.resolutionProposal.findUniqueOrThrow({ where: { id: p0.id } });
      if (send.status === "fulfilled") {
        expect(final.status).toBe("sent"); // regenerate ran after send and left it alone
      } else {
        expect(final.status).toBe("superseded"); // regenerate won; send was refused
      }
      const liveNow = await live(c.id);
      expect(liveNow).toHaveLength(1);
      expect(await pointer(c.id)).toBe(liveNow[0].id);
    }
  });

  it("review racing regenerate never leaves a decided approval on a superseded proposal being changed", async () => {
    for (let round = 0; round < 8; round++) {
      const c = await newCase();
      const [p0] = await live(c.id);
      const a = await approvalFor(p0.id);
      await Promise.allSettled([reviewApproval(reviewer, a.id, "approved"), regenerateResolutionProposal(agent, c.id, slowDeps)]);
      const after = await approvalFor(p0.id);
      const proposalAfter = await db.resolutionProposal.findUniqueOrThrow({ where: { id: p0.id } });
      // Either the human decision landed first (approval stays approved) or supersede did (approval superseded).
      expect(["approved", "superseded"]).toContain(after.decision);
      if (after.decision === "approved") expect(after.decisionTime).not.toBeNull();
      if (after.decision === "superseded") expect(after.decisionTime).toBeNull();
      expect(proposalAfter.status).toBe("superseded");
      expect(await live(c.id)).toHaveLength(1);
    }
  });
});
