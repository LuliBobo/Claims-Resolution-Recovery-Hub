import { describe, expect, it } from "vitest";
import { approvalSummary } from "@/lib/proposal-label";
import { diffEdits, draftEditsSchema, proposalEditsSchema } from "@/lib/validation/review";

describe("edit schemas", () => {
  it("accept only the whitelisted fields and reject empty text", () => {
    expect(proposalEditsSchema.safeParse({ rationale: "ok" }).success).toBe(true);
    expect(proposalEditsSchema.safeParse({ rationale: "  " }).success).toBe(false);
    for (const forbidden of ["status", "confidence", "policySource", "evidenceGateApplied", "linkedCaseId"]) {
      expect(proposalEditsSchema.safeParse({ [forbidden]: "x" }).success).toBe(false);
    }
    expect(draftEditsSchema.safeParse({ estimatedRecoverableValue: -1 }).success).toBe(false);
    expect(draftEditsSchema.safeParse({ status: "sent" }).success).toBe(false);
  });
});

describe("diffEdits", () => {
  it("keeps only real changes, recording from and to", () => {
    const d = diffEdits({ a: "x", b: "y", v: 40 }, { a: "x", b: "z", v: 55 });
    expect(d).toEqual({ b: { from: "y", to: "z" }, v: { from: 40, to: 55 } });
  });
  it("treats an unchanged number as no change and ignores undefined", () => {
    expect(diffEdits({ v: 40 }, { v: 40 })).toEqual({});
    expect(diffEdits({ a: "x" }, { a: undefined })).toEqual({});
  });
  it("records null as the previous value of a missing field", () => {
    expect(diffEdits({ v: null }, { v: 5 })).toEqual({ v: { from: null, to: 5 } });
  });
});

describe("approvalSummary", () => {
  it("describes edits, reviewer and comment", () => {
    expect(approvalSummary([])).toBe("none");
    expect(approvalSummary([{ decision: "pending", reviewer: null, reviewerComment: null, edits: null }])).toBe("pending");
    expect(approvalSummary([{ decision: "approved", reviewer: "r@x.io", reviewerComment: "ok", edits: { draftText: {}, estimatedRecoverableValue: {} } }])).toBe(
      'approved with edits by r@x.io (edited: draftText, estimatedRecoverableValue) - "ok"',
    );
    expect(approvalSummary([{ decision: "evidence_requested", reviewer: "r@x.io", reviewerComment: "need carton photo", edits: null }])).toBe(
      'evidence requested by r@x.io - "need carton photo"',
    );
  });
});
