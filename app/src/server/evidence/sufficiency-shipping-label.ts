import type { EvidenceStatus } from "@/generated/prisma/client";

// Pure. A shipping label documents the shipment, so it must be legible and carry tracking
// number, carrier, address and ship date. It is never asked to depict damage.

export interface ShippingLabelObservation {
  legible: boolean;
  hasTrackingNumber: boolean;
  hasCarrier: boolean;
  hasAddress: boolean;
  hasShipDate: boolean;
}

export function judgeShippingLabelSufficiency(o: ShippingLabelObservation): { status: EvidenceStatus; reason: string } {
  if (!o.legible) return { status: "insufficient", reason: "Label is not legible." };
  const missing = [
    !o.hasTrackingNumber && "tracking number",
    !o.hasCarrier && "carrier",
    !o.hasAddress && "address",
    !o.hasShipDate && "ship date",
  ].filter(Boolean);
  if (missing.length > 0) return { status: "insufficient", reason: `Label is missing: ${missing.join(", ")}.` };
  return { status: "sufficient", reason: "Legible label with tracking, carrier, address and ship date." };
}
