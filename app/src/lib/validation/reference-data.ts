import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();
const optionalDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });
const checkbox = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === "on" || v === "true");

export const orderInput = z.object({
  orderDate: z.coerce.date(),
  salesChannel: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerEmail: optionalText,
  customerPhone: optionalText,
  sku: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
  orderValue: z.coerce.number().nonnegative(),
  supplier: optionalText,
});

export const shipmentInput = z.object({
  linkedOrderId: z.string().min(1),
  carrier: z.string().trim().min(1),
  trackingNumber: z.string().trim().min(1),
  warehouse: optionalText,
  shipDate: optionalDate,
  deliveryDate: optionalDate,
  deliveryStatus: z.enum(["pending", "in_transit", "delivered", "delayed", "lost", "returned"]),
});

export const policyDocumentInput = z.object({
  name: z.string().trim().min(1),
  documentType: z.enum(["policy", "terms", "carrier_agreement", "supplier_agreement", "other"]),
  version: optionalText,
  jurisdiction: optionalText,
  summary: optionalText,
  activeStatus: checkbox.default(true),
});

export const ruleInput = z.object({
  ruleName: z.string().trim().min(1),
  triggerType: z.enum(["damaged_delivery", "wrong_item", "missing_item", "return_request", "other"]),
  requiredEvidence: optionalText,
  recommendedResolution: optionalText,
  escalationPath: optionalText,
  linkedPolicyDocumentId: optionalText,
  activeStatus: checkbox.default(true),
});

export type OrderInput = z.infer<typeof orderInput>;
export type ShipmentInput = z.infer<typeof shipmentInput>;
export type PolicyDocumentInput = z.infer<typeof policyDocumentInput>;
export type RuleInput = z.infer<typeof ruleInput>;
