import { buildTextPdf } from "@/lib/pdf-build";
import { db } from "@/server/db";
import { ingestPolicyPdf } from "@/server/policy/ingest";
import { seedActors } from "./sample-data";

// Synthetic policy text for the three starter policy documents, so a demo database has real PDFs
// to retrieve and cite from. Clearly marked as sample content; replace with the merchant's own PDFs.
const NOTE = "SAMPLE POLICY TEXT (synthetic, for demonstration only). Replace this document with your own policy.";

const TEXTS: Record<string, string[]> = {
  "DPD Carrier Claims SOP": [
    `${NOTE}\nDPD Carrier Claims SOP. Section 1, scope. This procedure applies to parcels handed to the carrier that arrive damaged. A claim for transit damage must be filed within 7 days of the delivery date. Claims filed later are normally rejected by the carrier.`,
    `Section 2, required evidence. Every transit damage claim must include three items: a photo of the shipping label showing the tracking number, a clear photo of the damaged item, and a photo of the outer carton showing its condition. A claim without all three items will not be accepted. Request any missing item from the customer before filing.`,
    `Section 3, handling. Keep the damaged goods and packaging until the claim is settled. Record the tracking number, delivery date and estimated value of the goods. Claim value is limited to the purchase price of the damaged goods. Escalate disputed carrier decisions to the carrier account manager.`,
  ],
  "Customer Returns & Refunds Policy": [
    `${NOTE}\nCustomer Returns and Refunds Policy. Section 1, return window. Customers may return unused goods within 14 days of receiving them. A refund is issued after the returned goods are received and checked.`,
    `Section 2, damaged or incorrect goods. If goods arrive damaged or the wrong item was delivered, the customer is entitled to a replacement or a full refund at their choice, without paying for return shipping. The customer should provide a photo showing the problem.`,
    `Section 3, missing items. If an item or part is missing from a delivery, check the tracking status first. If the parcel shows as delivered but the customer did not receive it, open an investigation with the carrier and offer a replacement shipment or refund once the carrier confirms the loss.`,
  ],
  "Supplier Quality Agreement": [
    `${NOTE}\nSupplier Quality Agreement. Section 1, wrong or defective goods. The supplier is responsible for goods shipped that do not match the order, and for goods that are defective on arrival. The merchant may claim the purchase cost of the goods from the supplier.`,
    `Section 2, claim procedure. A supplier claim must be raised within 30 days of the customer complaint and include the order number, the SKU, photos of the received item and the packing slip. The supplier replies within 10 working days.`,
  ],
};

export async function seedSamplePolicyPdfs(): Promise<number> {
  let created = 0;
  for (const [name, pages] of Object.entries(TEXTS)) {
    const doc = await db.policyDocument.findFirst({ where: { name }, include: { file: { select: { policyDocumentId: true } } } });
    if (!doc || doc.file) continue; // never overwrite a real upload
    await ingestPolicyPdf(seedActors.admin, doc.id, { fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sample.pdf`, bytes: buildTextPdf(pages) });
    created++;
  }
  return created;
}
