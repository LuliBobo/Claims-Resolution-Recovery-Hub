import { z } from "zod";

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(blankToUndefined, z.string().trim().optional());

export const CASE_TYPES = ["damaged_delivery", "wrong_item", "missing_item", "return_request", "other"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const SOURCES = ["email", "chat", "phone", "marketplace", "web_form", "other"] as const;
export const STATUSES = ["new", "in_review", "awaiting_approval", "resolved", "escalated", "closed"] as const;
export const ATTACHMENT_CATEGORIES = ["photo_evidence", "invoice", "shipping_label", "correspondence", "other"] as const;

export const caseCreateInput = z.object({
  source: z.enum(SOURCES),
  customerName: z.string().trim().min(1),
  customerEmail: optionalText,
  customerPhone: optionalText,
  // Blank means "detect automatically".
  customerLanguage: optionalText,
  orderReference: optionalText,
  complaintText: z.string().trim().min(1),
  // Blank means "classify automatically".
  caseType: z.preprocess(blankToUndefined, z.enum(CASE_TYPES).optional()),
  priority: z.preprocess(blankToUndefined, z.enum(PRIORITIES).optional()),
  linkedOrderId: optionalText,
  linkedShipmentId: optionalText,
});

export const caseUpdateInput = z.object({
  status: z.enum(STATUSES).optional(),
  caseType: z.enum(CASE_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedReviewer: optionalText,
  recoveryNeeded: z.boolean().optional(),
});

export const caseFilterInput = z.object({
  status: z.preprocess(blankToUndefined, z.enum(STATUSES).optional()),
  priority: z.preprocess(blankToUndefined, z.enum(PRIORITIES).optional()),
  caseType: z.preprocess(blankToUndefined, z.enum(CASE_TYPES).optional()),
  source: z.preprocess(blankToUndefined, z.enum(SOURCES).optional()),
  q: optionalText,
});

export type CaseCreateInput = z.infer<typeof caseCreateInput>;
export type CaseUpdateInput = z.infer<typeof caseUpdateInput>;
export type CaseFilterInput = z.infer<typeof caseFilterInput>;
