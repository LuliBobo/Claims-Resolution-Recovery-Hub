import type { AttachmentObservation } from "@/server/evidence/assess";
import type { GeneratedProposal, ProposalContext } from "@/server/llm/generate-proposal";
import type { GeneratedRecoveryDraft } from "@/server/llm/generate-recovery-draft";

// Content for the two demo scenarios. Everything here stands in for AI output so the demo is
// stable and works with no API key (the presentation script's "backup plan if live AI fails").
// The data is pushed through the REAL workflows (evidence gate, supersession, approvals, audit).

export const VASE_REF = "DEMO-VASE-0001";
export const WRONG_REF = "DEMO-WRONG-0001";

export const VASE = {
  customerName: "Lucía Fernández",
  customerEmail: "lucia.fernandez@demo.example",
  language: "es",
  complaint:
    "Hola, el jarrón de cristal que pedí la semana pasada llegó roto en tres pedazos. La caja exterior estaba aplastada por una esquina. Adjunto fotos del jarrón. Me gustaría que me enviaran uno nuevo, por favor. Gracias, Lucía.",
  summary:
    "Customer reports the glass vase arrived broken in three pieces and the outer box was crushed at one corner. Photos of the vase are attached. She asks for a replacement.",
  order: { productName: "Handblown Glass Vase", sku: "DEMO-VASE-01", quantity: 1, orderValue: 89, supplier: "Murano Glass Works" },
  shipment: { carrier: "DPD", trackingNumber: "DEMO-TRACK-0001", warehouse: "Bratislava" },
};

export const WRONG = {
  customerName: "Daniel Brooks",
  customerEmail: "daniel.brooks@demo.example",
  language: "en",
  complaint: "I ordered the white Ceramic Pour-Over Coffee Set but the black one arrived. The photo shows the box label. Please send the correct set.",
  summary: "Customer ordered the white ceramic pour-over coffee set but received the black one, and asks for the correct set.",
  order: { productName: "Ceramic Pour-Over Coffee Set (white)", sku: "DEMO-COFFEE-02", quantity: 1, orderValue: 54, supplier: "Nordic Homeware Trading s.r.o." },
  shipment: { carrier: "GLS", trackingNumber: "DEMO-TRACK-0002", warehouse: "Bratislava" },
};

export const photoObservation = (subject: "item" | "outer_carton", notes: string): AttachmentObservation => ({
  kind: "photo",
  notes,
  observation: { legible: true, showsDamageOrCondition: true, subject },
});
export const labelObservation = (notes: string): AttachmentObservation => ({
  kind: "shipping_label",
  notes,
  observation: { legible: true, hasTrackingNumber: true, hasCarrier: true, hasAddress: true, hasShipDate: true },
});

/** Cites the first retrieved policy excerpts, deterministically (none if no policy PDFs exist). */
const cite = (ctx: ProposalContext) => ctx.policyExcerpts.slice(0, 2).map((e) => e.id);

/** `before`: the customer has not yet sent the outer-carton photo. `after`: it has. */
export const vaseProposal = (stage: "before" | "after") => async (ctx: ProposalContext): Promise<GeneratedProposal> => ({
  recommendation: "Arrange Replacement Shipment",
  rationale:
    "The vase arrived broken and the customer asks for a replacement. Damaged goods entitle the customer to a replacement or refund, and the loss is recoverable from the carrier under the carrier claims procedure.",
  confidence: 0.88,
  customerImpact: "Moderate: the customer is waiting for a replacement",
  businessExposure: "Manageable: 89.00 plus shipping, recoverable from the carrier",
  policySource: "DPD Carrier Claims SOP v1.0; Customer Returns & Refunds Policy v1.0",
  needsHumanApproval: true,
  customerReplyDraft:
    stage === "before"
      ? "Hola Lucía,\n\nLamentamos mucho que su jarrón haya llegado roto. Vamos a enviarle uno nuevo sin ningún coste. Para completar la reclamación al transportista, le agradeceríamos una foto de la caja exterior en la que se vea su estado. En cuanto la recibamos, preparamos el envío.\n\nUn saludo,\nAtención al cliente"
      : "Hola Lucía,\n\nGracias por la foto de la caja. Hemos aprobado el envío de un jarrón nuevo sin ningún coste y recibirá el número de seguimiento en cuanto salga de nuestro almacén.\n\nUn saludo,\nAtención al cliente",
  citedExcerptIds: cite(ctx),
});

export const vaseRecovery = async (): Promise<GeneratedRecoveryDraft> => ({
  claimType: "Transit damage",
  draftText:
    "To: DPD Customer Claims\nRe: Transit damage claim, tracking DEMO-TRACK-0001\n\nWe request a claim for a parcel delivered with transit damage. Order: Handblown Glass Vase (SKU DEMO-VASE-01), declared value 89.00. The item arrived broken in three pieces and the outer carton was crushed at one corner. Evidence: shipping label photo and photo of the damaged item attached; the outer carton photo will follow. Estimated recoverable amount: 89.00.\n\nRequested next step: please confirm receipt of the claim and the settlement timeline.",
  estimatedRecoverableValue: 89,
});

export const vaseEvidenceRequest = async () => ({
  message:
    "Hola Lucía,\n\nLamentamos lo ocurrido con su jarrón. Para poder tramitar la reclamación al transportista y enviarle uno nuevo, necesitamos una foto de la caja exterior en la que se vea claramente su estado (por ejemplo, la esquina aplastada). Puede responder a este correo con la imagen.\n\nGracias por su ayuda.\nAtención al cliente",
});

export const wrongProposal = async (ctx: ProposalContext): Promise<GeneratedProposal> => ({
  recommendation: "Arrange Replacement Shipment",
  rationale: "The wrong colour was shipped, which is a fulfilment error covered by the supplier agreement. Send the correct set and claim the cost from the supplier.",
  confidence: 0.91,
  customerImpact: "Low: a replacement resolves it",
  businessExposure: "Negligible: 54.00, claimable from the supplier",
  policySource: "Supplier Quality Agreement v1.0; Customer Returns & Refunds Policy v1.0",
  needsHumanApproval: true,
  customerReplyDraft:
    "Hello Daniel,\n\nSorry about the mix-up. We are sending the white Ceramic Pour-Over Coffee Set at no cost and you will receive the tracking number once it leaves our warehouse. You can keep or recycle the black set.\n\nKind regards,\nCustomer Support",
  citedExcerptIds: cite(ctx),
});

export const wrongRecovery = async (): Promise<GeneratedRecoveryDraft> => ({
  claimType: "Wrong item shipped",
  draftText:
    "To: Nordic Homeware Trading s.r.o., Quality Team\nRe: Wrong item shipped, order DEMO-COFFEE-02\n\nWe received a customer complaint that the black Ceramic Pour-Over Coffee Set was delivered instead of the white one ordered. Photo of the received item attached. We are replacing the order and ask you to credit the purchase cost of 54.00 under the quality agreement.\n\nRequested next step: please confirm the credit within 10 working days.",
  estimatedRecoverableValue: 54,
});
