// Display label for a proposal, derived from its status together with its (untouched) linked
// approval's decision. Pure, so it is unit-tested.

export interface LabelApproval {
  decision: string;
  reviewer: string | null;
  decisionTime: Date | null;
}
export interface LabelProposal {
  id: string;
  status: string;
  approvals: LabelApproval[];
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "unknown date");

export function proposalLabel(p: LabelProposal, currentId: string | null): { badge: "Current" | "Superseded" | null; text: string } {
  if (p.status === "superseded") {
    const decided = p.approvals.find((a) => a.decision === "approved" || a.decision === "rejected");
    return {
      badge: "Superseded",
      text: decided
        ? `Superseded: ${decided.decision} by ${decided.reviewer ?? "unknown"} on ${day(decided.decisionTime)}, replaced before being sent`
        : "Superseded: no decision was recorded before it was replaced",
    };
  }
  if (p.id === currentId) return { badge: "Current", text: "Current proposal" };
  return { badge: null, text: "" };
}

export interface SummaryApproval {
  decision: string;
  reviewer: string | null;
  reviewerComment: string | null;
  edits: unknown;
}

/** One-line description of an approval for the case page, including edits and comments. */
export function approvalSummary(approvals: SummaryApproval[]): string {
  if (approvals.length === 0) return "none";
  return approvals
    .map((a) => {
      const edited = a.edits && typeof a.edits === "object" ? Object.keys(a.edits as object) : [];
      const decision = a.decision === "approved" && edited.length ? "approved with edits" : a.decision.replace("_", " ");
      return [
        decision,
        a.reviewer ? `by ${a.reviewer}` : null,
        edited.length ? `(edited: ${edited.join(", ")})` : null,
        a.reviewerComment ? `- "${a.reviewerComment}"` : null,
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("; ");
}
