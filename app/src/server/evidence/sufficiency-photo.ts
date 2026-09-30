import type { EvidenceStatus, PhotoSubject } from "@/generated/prisma/client";

// Pure. Maps the judge's observation of a photo_evidence attachment to the ONE
// Attachment.evidenceStatus every consumer reads. A photo is sufficient only if it is
// legible and shows the item's damage or condition. Shipping labels are judged by
// sufficiency-shipping-label.ts, never by this bar.

export interface PhotoObservation {
  legible: boolean;
  showsDamageOrCondition: boolean;
  subject: PhotoSubject;
}

export function judgePhotoSufficiency(o: PhotoObservation): { status: EvidenceStatus; reason: string } {
  if (!o.legible) return { status: "insufficient", reason: "Photo is not clear enough to assess." };
  if (!o.showsDamageOrCondition) {
    return { status: "insufficient", reason: "Photo does not show the damage or condition of the goods or packaging." };
  }
  return { status: "sufficient", reason: "Clear photo showing damage or condition." };
}
