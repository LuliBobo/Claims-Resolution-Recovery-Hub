import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AttachmentCategory } from "@/generated/prisma/client";
import type { AttachmentObservation } from "@/server/evidence/assess";
import { callClaudeJson, LlmError } from "./client";
import {
  DOCUMENT_INSTRUCTIONS,
  EVIDENCE_SYSTEM,
  PHOTO_INSTRUCTIONS,
  SHIPPING_LABEL_INSTRUCTIONS,
} from "./prompts/evidence";

const notes = z.string().describe("One or two sentences describing what the file shows");
const photoSchema = z.object({
  legible: z.boolean(),
  showsDamageOrCondition: z.boolean(),
  subject: z.enum(["item", "outer_carton", "other"]),
  notes,
});
const labelSchema = z.object({
  legible: z.boolean(),
  hasTrackingNumber: z.boolean(),
  hasCarrier: z.boolean(),
  hasAddress: z.boolean(),
  hasShipDate: z.boolean(),
  notes,
});
const docSchema = z.object({ legible: z.boolean(), relevantToCase: z.boolean(), notes });

export interface JudgeInput {
  category: AttachmentCategory;
  fileName: string;
  contentType: string; // sniffed, not declared
  bytes: Uint8Array;
  complaintSummary: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function fileBlocks(input: JudgeInput): Anthropic.ContentBlockParam[] | string {
  const b64 = Buffer.from(input.bytes).toString("base64");
  if (IMAGE_TYPES.has(input.contentType)) {
    return [{ type: "image", source: { type: "base64", media_type: input.contentType as "image/png", data: b64 } }];
  }
  if (input.contentType === "application/pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }];
  }
  return Buffer.from(input.bytes).toString("utf-8").slice(0, 20_000);
}

/** Asks the LLM to describe an attachment. Returns an observation; it never decides sufficiency. */
export async function observeAttachment(input: JudgeInput): Promise<AttachmentObservation> {
  const blocks = fileBlocks(input);
  const extraContent = typeof blocks === "string" ? [{ type: "text" as const, text: `File content:\n${blocks}` }] : blocks;
  const base = {
    system: EVIDENCE_SYSTEM,
    extraContent,
    description: "Record observations about the attachment.",
  };
  const context = `File name: ${input.fileName}\nComplaint summary: ${input.complaintSummary}`;

  if (input.category === "photo_evidence") {
    if (input.contentType === "text/plain") throw new LlmError("photo_evidence must be an image");
    const r = await callClaudeJson({ ...base, name: "record_photo_observation", user: `${PHOTO_INSTRUCTIONS}\n${context}`, schema: photoSchema });
    const { notes: n, ...observation } = r;
    return { kind: "photo", observation, notes: n };
  }
  if (input.category === "shipping_label") {
    const r = await callClaudeJson({ ...base, name: "record_label_observation", user: `${SHIPPING_LABEL_INSTRUCTIONS}\n${context}`, schema: labelSchema });
    const { notes: n, ...observation } = r;
    return { kind: "shipping_label", observation, notes: n };
  }
  const r = await callClaudeJson({ ...base, name: "record_document_observation", user: `${DOCUMENT_INSTRUCTIONS}\n${context}`, schema: docSchema });
  const { notes: n, ...observation } = r;
  return { kind: "document", observation, notes: n };
}
