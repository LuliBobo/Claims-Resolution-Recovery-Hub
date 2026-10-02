import { normalizeNewlines } from "@/lib/validation/review";
import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { evaluateCarrierClaimsGate } from "@/server/evidence/carrier-claims-gate";
import { describeMissingEvidence, type MissingEvidenceItem } from "@/server/evidence/missing-evidence";
import { generateEvidenceRequestText, type EvidenceRequestContext } from "@/server/llm/generate-evidence-request";
import { findActiveRulesForCaseType } from "@/server/reference-data";
import { lockCase, type Tx } from "./proposal-supersession";

type Client = Tx | typeof db;

export class MessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageError";
  }
}

export interface MessageDeps {
  generate: (ctx: EvidenceRequestContext) => Promise<{ message: string }>;
}
const defaultDeps: MessageDeps = { generate: generateEvidenceRequestText };

/** What the customer still needs to provide, recomputed from current data. Never cached. */
export async function getMissingEvidence(caseId: string, client: Client = db): Promise<MissingEvidenceItem[]> {
  const c = await client.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      caseType: true,
      currentResolutionProposalId: true,
      attachments: { select: { fileName: true, attachmentCategory: true, evidenceStatus: true, evidenceReason: true, photoSubject: true } },
    },
  });
  const rules = await findActiveRulesForCaseType(c.caseType, client);
  const gate = evaluateCarrierClaimsGate({
    caseType: c.caseType,
    matchedPolicyNames: rules.flatMap((r) => (r.linkedPolicyDocument ? [r.linkedPolicyDocument.name] : [])),
    attachments: c.attachments,
  });

  // The reviewer's "request more evidence" note: on the current proposal, or on the latest recovery
  // draft while it is still the one awaiting more evidence (a newer draft replaces it).
  const proposalNote = c.currentResolutionProposalId
    ? await client.humanApproval.findFirst({
        where: { linkedResolutionProposalId: c.currentResolutionProposalId, decision: "evidence_requested" },
        orderBy: { decisionTime: "desc" },
        select: { reviewerComment: true },
      })
    : null;
  const latestDraft = await client.recoveryDraft.findFirst({
    where: { linkedCaseId: caseId },
    orderBy: { createdAt: "desc" },
    select: { status: true, approvals: { where: { decision: "evidence_requested" }, orderBy: { decisionTime: "desc" }, take: 1, select: { reviewerComment: true } } },
  });
  const draftNote = latestDraft?.status === "evidence_requested" ? latestDraft.approvals[0]?.reviewerComment : null;
  const reviewerNote = [proposalNote?.reviewerComment, draftNote].filter(Boolean).join("; ") || null;

  return describeMissingEvidence({
    gate,
    attachments: c.attachments.map((a) => ({ fileName: a.fileName, category: a.attachmentCategory, photoSubject: a.photoSubject, evidenceStatus: a.evidenceStatus, evidenceReason: a.evidenceReason })),
    ruleRequiredEvidence: rules.flatMap((r) => (r.requiredEvidence ? [r.requiredEvidence] : [])),
    reviewerNote,
  });
}

/**
 * Drafts an email asking the customer for what is missing, in their language. The list comes from
 * getMissingEvidence; the AI only words it. Any earlier open draft is discarded so a case has at most
 * one. Throws if nothing is missing or the AI call fails.
 */
export async function generateEvidenceRequest(actor: Actor | null, caseId: string, deps: MessageDeps = defaultDeps) {
  const user = requireRole(actor, ...ANY_ROLE);
  const c = await db.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { customerName: true, customerLanguage: true, orderReference: true, order: { select: { productName: true } } },
  });
  const items = await getMissingEvidence(caseId);
  if (items.length === 0) throw new MessageError("Nothing is missing: the evidence is complete and no reviewer has asked for more");

  const { message } = await deps.generate({
    customerName: c.customerName,
    customerLanguage: c.customerLanguage,
    orderReference: c.orderReference,
    productName: c.order?.productName ?? null,
    itemsToRequest: items.map((i) => i.text),
  });

  return db.$transaction(
    async (tx) => {
      await lockCase(tx, caseId);
      const discarded = await tx.customerMessageDraft.updateMany({
        where: { linkedCaseId: caseId, kind: "evidence_request", status: "draft" },
        data: { status: "discarded" },
      });
      const draft = await tx.customerMessageDraft.create({
        data: {
          linkedCaseId: caseId,
          kind: "evidence_request",
          language: c.customerLanguage,
          body: message.trim(),
          missingItems: items.map((i) => i.text),
          createdBy: user.email,
        },
      });
      await logAuditEvent(
        {
          caseId,
          actor: user.email,
          action: "evidence_request_drafted",
          newState: "draft",
          notes: `${items.length} item(s)${discarded.count ? `; replaced ${discarded.count} earlier draft(s)` : ""}`,
        },
        tx,
      );
      return draft;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}

async function loadOpenDraft(tx: Tx, draftId: string) {
  const head = await tx.customerMessageDraft.findUniqueOrThrow({ where: { id: draftId }, select: { linkedCaseId: true } });
  await lockCase(tx, head.linkedCaseId);
  const d = await tx.customerMessageDraft.findUniqueOrThrow({ where: { id: draftId } });
  if (d.status !== "draft") throw new MessageError(`This message is already ${d.status}`);
  return d;
}

/** Edit the text of an open draft (the person's own wording wins over the AI's). */
export async function editMessageDraft(actor: Actor | null, draftId: string, body: string) {
  const user = requireRole(actor, ...ANY_ROLE);
  const text = normalizeNewlines(body).trim();
  if (!text) throw new MessageError("The message cannot be empty");
  return db.$transaction(async (tx) => {
    const d = await loadOpenDraft(tx, draftId);
    if (d.body === text) throw new MessageError("No changes were made");
    const updated = await tx.customerMessageDraft.update({ where: { id: draftId }, data: { body: text } });
    await logAuditEvent({ caseId: d.linkedCaseId, actor: user.email, action: "evidence_request_edited", notes: "Message text edited" }, tx);
    return updated;
  });
}

/**
 * Manual attestation that a person sent this message. Nothing is transmitted. Refused if nothing is
 * missing anymore (the request would be obsolete): discard it instead.
 */
export async function markMessageSent(actor: Actor | null, draftId: string) {
  const user = requireRole(actor, ...ANY_ROLE);
  return db.$transaction(async (tx) => {
    const d = await loadOpenDraft(tx, draftId);
    if ((await getMissingEvidence(d.linkedCaseId, tx)).length === 0) {
      throw new MessageError("The evidence is now complete, so this request is obsolete. Discard it instead");
    }
    const sent = await tx.customerMessageDraft.updateMany({
      where: { id: draftId, status: "draft" },
      data: { status: "sent", sentAt: new Date(), sentBy: user.email },
    });
    if (sent.count === 0) throw new MessageError("Message changed state; reload and retry");
    await logAuditEvent({ caseId: d.linkedCaseId, actor: user.email, action: "evidence_request_sent", previousState: "draft", newState: "sent", notes: "Manual attestation" }, tx);
    return tx.customerMessageDraft.findUniqueOrThrow({ where: { id: draftId } });
  });
}

export async function discardMessage(actor: Actor | null, draftId: string) {
  const user = requireRole(actor, ...ANY_ROLE);
  return db.$transaction(async (tx) => {
    const d = await loadOpenDraft(tx, draftId);
    const updated = await tx.customerMessageDraft.update({ where: { id: draftId }, data: { status: "discarded" } });
    await logAuditEvent({ caseId: d.linkedCaseId, actor: user.email, action: "evidence_request_discarded", previousState: "draft", newState: "discarded" }, tx);
    return updated;
  });
}
