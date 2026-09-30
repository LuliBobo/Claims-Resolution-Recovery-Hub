import type { z } from "zod";
import type { CallJsonOptions } from "./client";

// Deterministic stand-in for the Anthropic API, used ONLY by the Playwright E2E run
// (E2E_FAKE_LLM=1). It answers by tool name and still validates against each call's real
// zod schema, so a schema change breaks E2E instead of hiding behind the fake.
// Photo subject comes from the file name here; that is a test convenience, not product logic.

export function assertFakeLlmAllowed() {
  if (process.env.VERCEL_ENV === "production") throw new Error("E2E_FAKE_LLM must never be enabled in production");
}

export function fakeCall<T extends z.ZodType>(opts: CallJsonOptions<T>): z.infer<T> {
  assertFakeLlmAllowed();
  const fileName = /File name: (.*)/.exec(opts.user)?.[1] ?? "";
  const out: Record<string, unknown> = {
    record_complaint_summary: { customerLanguage: "en", internalEnglishSummary: "E2E: item arrived broken." },
    record_classification: { caseType: "damaged_delivery", priority: "medium", confidence: 0.9 },
    record_resolution_proposal: {
      recommendation: "Arrange Replacement Shipment", rationale: "E2E rationale.", confidence: 0.8, customerImpact: "moderate",
      businessExposure: "manageable", policySource: "DPD Carrier Claims SOP v1.0", needsHumanApproval: true, customerReplyDraft: "E2E reply to the customer.",
    },
    record_recovery_draft: { claimType: "Transit damage", draftText: "E2E claim text for the carrier.", estimatedRecoverableValue: 40 },
    record_photo_observation: {
      legible: true, showsDamageOrCondition: true, subject: /carton|outer|box/i.test(fileName) ? "outer_carton" : "item", notes: "E2E photo",
    },
    record_label_observation: { legible: true, hasTrackingNumber: true, hasCarrier: true, hasAddress: true, hasShipDate: true, notes: "E2E label" },
    record_document_observation: { legible: true, relevantToCase: true, notes: "E2E document" },
  };
  if (!(opts.name in out)) throw new Error(`Fake LLM has no answer for ${opts.name}`);
  return opts.schema.parse(out[opts.name]);
}
