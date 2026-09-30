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
