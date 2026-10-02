import type { AttachmentCategory, EvidenceStatus, PhotoSubject } from "@/generated/prisma/client";

// Pure. Builds the deterministic list of what the customer still needs to provide. The AI only
// words the message around this list, so it cannot invent or drop a requirement.

export interface MissingEvidenceInput {
  gate: { applies: boolean; missing: readonly string[] };
  attachments: readonly {
    fileName: string;
    category: AttachmentCategory;
    photoSubject: PhotoSubject | null;
    evidenceStatus: EvidenceStatus;
    evidenceReason: string | null;
  }[];
  /** requiredEvidence text of the matched rules. */
  ruleRequiredEvidence: readonly string[];
  /** The reviewer's note from a "request more evidence" decision on the current proposal or draft. */
  reviewerNote: string | null;
}

export interface MissingEvidenceItem {
  kind: "required" | "insufficient" | "rule" | "reviewer";
  text: string;
}

const CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  photo_evidence: "photo",
  invoice: "invoice",
  shipping_label: "shipping label",
  correspondence: "correspondence",
  other: "document",
};
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeMissingEvidence(i: MissingEvidenceInput): MissingEvidenceItem[] {
  const items: MissingEvidenceItem[] = [];

  if (i.gate.applies) {
    for (const m of i.gate.missing) items.push({ kind: "required", text: `${capitalize(m)} (missing or not clear enough)` });
  } else if (i.attachments.length === 0) {
    for (const t of new Set(i.ruleRequiredEvidence.map((r) => r.trim()).filter(Boolean))) {
      items.push({ kind: "rule", text: `Required: ${t}` });
    }
  }

  // An insufficient file stops being a gap once a sufficient one covers the same slot (same
  // category and photo subject): the customer already fixed it by sending a better file.
  const slot = (a: { category: AttachmentCategory; photoSubject: PhotoSubject | null }) => `${a.category}:${a.photoSubject ?? ""}`;
  const covered = new Set(i.attachments.filter((a) => a.evidenceStatus === "sufficient").map(slot));
  for (const a of i.attachments) {
    if (a.evidenceStatus === "insufficient" && !covered.has(slot(a))) {
      items.push({ kind: "insufficient", text: `${a.fileName} (${CATEGORY_LABEL[a.category]}): ${a.evidenceReason ?? "not sufficient"}` });
    }
  }

  if (i.reviewerNote?.trim()) items.push({ kind: "reviewer", text: i.reviewerNote.trim() });
  return items;
}
