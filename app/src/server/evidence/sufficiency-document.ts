import type { EvidenceStatus } from "@/generated/prisma/client";

// Pure. Invoices, correspondence and other documents need legibility and relevance to the case.

export interface DocumentObservation {
  legible: boolean;
  relevantToCase: boolean;
}

export function judgeDocumentSufficiency(o: DocumentObservation): { status: EvidenceStatus; reason: string } {
  if (!o.legible) return { status: "insufficient", reason: "Document is not legible." };
  if (!o.relevantToCase) return { status: "insufficient", reason: "Document does not appear relevant to this case." };
  return { status: "sufficient", reason: "Legible and relevant." };
}
