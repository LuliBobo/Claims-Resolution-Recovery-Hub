import type { EvidenceStatus, PhotoSubject } from "@/generated/prisma/client";
import { judgeDocumentSufficiency, type DocumentObservation } from "./sufficiency-document";
import { judgePhotoSufficiency, type PhotoObservation } from "./sufficiency-photo";
import { judgeShippingLabelSufficiency, type ShippingLabelObservation } from "./sufficiency-shipping-label";

// What the LLM observes about an attachment, by category. The LLM only describes; the
// pure sufficiency modules decide the status.
export type AttachmentObservation =
  | { kind: "photo"; observation: PhotoObservation; notes: string }
  | { kind: "shipping_label"; observation: ShippingLabelObservation; notes: string }
  | { kind: "document"; observation: DocumentObservation; notes: string };

export interface Assessment {
  status: EvidenceStatus;
  reason: string;
  notes: string;
  photoSubject: PhotoSubject | null;
}

export function assessObservation(o: AttachmentObservation): Assessment {
  switch (o.kind) {
    case "photo":
      return { ...judgePhotoSufficiency(o.observation), notes: o.notes, photoSubject: o.observation.subject };
    case "shipping_label":
      return { ...judgeShippingLabelSufficiency(o.observation), notes: o.notes, photoSubject: null };
    case "document":
      return { ...judgeDocumentSufficiency(o.observation), notes: o.notes, photoSubject: null };
  }
}
