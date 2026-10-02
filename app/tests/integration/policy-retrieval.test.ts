import { afterAll, describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/pdf-build";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { PdfError } from "@/server/policy/extract-pdf";
import { buildSearchTerms } from "@/server/policy/chunk";
import { deletePolicyPdf, ingestPolicyPdf, loadPolicyPdf } from "@/server/policy/ingest";
import { searchPolicyPassages } from "@/server/policy/search";
import { createCase } from "@/server/workflows/case-intake";
import type { ProposalContext } from "@/server/llm/generate-proposal";

const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };

const docIds: string[] = [];
const ruleIds: string[] = [];
const caseIds: string[] = [];
const mkDoc = async (name: string, extra: Record<string, unknown> = {}) => {
  const d = await db.policyDocument.create({ data: { name, documentType: "policy", version: "2.1", ...extra } as never });
  docIds.push(d.id);
  return d;
};
const pdf = (...pages: string[]) => ({ fileName: "policy.pdf", bytes: buildTextPdf(pages) });
const passageCount = (id: string) => db.policyPassage.count({ where: { policyDocumentId: id } });

afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.rule.deleteMany({ where: { id: { in: ruleIds } } });
  await db.policyDocument.deleteMany({ where: { id: { in: docIds } } });
  await db.$disconnect();
});

describe("ingestPolicyPdf", () => {
  it("stores the file and one searchable passage set with correct page numbers", async () => {
    const d = await mkDoc("Ingest Basic");
    const r = await ingestPolicyPdf(reviewer, d.id, pdf("Alpha clause about zebrafish handling.", "Beta clause about quokka returns."));
    expect(r).toMatchObject({ pageCount: 2, emptyPages: 0, passageCount: 2 });
    const passages = await db.policyPassage.findMany({ where: { policyDocumentId: d.id }, orderBy: { page: "asc" } });
    expect(passages.map((p) => p.page)).toEqual([1, 2]);
    expect(passages[1].text).toContain("quokka");
    const f = await db.policyDocumentFile.findUniqueOrThrow({ where: { policyDocumentId: d.id } });
    expect(f).toMatchObject({ fileName: "policy.pdf", pageCount: 2, passageCount: 2, uploadedBy: "reviewer@test.io" });
    expect((await loadPolicyPdf(d.id))?.bytes.length).toBe(f.bytes.length);
  });

  it("is reviewer/admin only", async () => {
    const d = await mkDoc("Ingest Perms");
    await expect(ingestPolicyPdf(agent, d.id, pdf("x"))).rejects.toBeInstanceOf(AuthError);
    await expect(ingestPolicyPdf(null, d.id, pdf("x"))).rejects.toBeInstanceOf(AuthError);
    expect(await passageCount(d.id)).toBe(0);
  });

  it("rejects non-PDF content whatever the file is called, empty files, and corrupt PDFs, storing nothing", async () => {
    const d = await mkDoc("Ingest Bad");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await expect(ingestPolicyPdf(reviewer, d.id, { fileName: "policy.pdf", bytes: png })).rejects.toThrow(/Only PDF/);
    await expect(ingestPolicyPdf(reviewer, d.id, { fileName: "policy.pdf", bytes: new Uint8Array() })).rejects.toBeInstanceOf(PdfError);
    await expect(ingestPolicyPdf(reviewer, d.id, { fileName: "policy.pdf", bytes: new TextEncoder().encode("%PDF-1.4 junk junk junk") })).rejects.toBeInstanceOf(PdfError);
    expect(await passageCount(d.id)).toBe(0);
    expect(await db.policyDocumentFile.count({ where: { policyDocumentId: d.id } })).toBe(0);
  });

  it("an unknown policy document id fails cleanly", async () => {
    await expect(ingestPolicyPdf(reviewer, "00000000-0000-0000-0000-000000000000", pdf("x"))).rejects.toThrow();
  });

  it("a PDF without text is stored but reported as having nothing searchable", async () => {
    const d = await mkDoc("Ingest Scanned");
    const r = await ingestPolicyPdf(reviewer, d.id, pdf("", ""));
    expect(r).toEqual({ pageCount: 2, emptyPages: 2, passageCount: 0 });
    expect(await passageCount(d.id)).toBe(0);
  });

  it("re-uploading replaces the file and every passage", async () => {
    const d = await mkDoc("Ingest Replace");
    await ingestPolicyPdf(reviewer, d.id, pdf("Old text about walrus."));
    await ingestPolicyPdf(reviewer, d.id, pdf("New text about lemur.", "More new text."));
    const texts = (await db.policyPassage.findMany({ where: { policyDocumentId: d.id } })).map((p) => p.text).join(" ");
    expect(texts).toContain("lemur");
    expect(texts).not.toContain("walrus");
    expect(await passageCount(d.id)).toBe(2);
  });

  it("concurrent re-uploads never mix passages from different versions", async () => {
    for (let round = 0; round < 3; round++) {
      const d = await mkDoc(`Ingest Race ${round}`);
      const versions = [pdf("Version A one.", "Version A two."), pdf("Version B one.", "Version B two.", "Version B three."), pdf("Version C only.")];
      await Promise.all(versions.map((v) => ingestPolicyPdf(reviewer, d.id, v)));
      const passages = await db.policyPassage.findMany({ where: { policyDocumentId: d.id } });
      const labels = new Set(passages.map((p) => /Version (\w)/.exec(p.text)?.[1]));
      expect(labels.size).toBe(1);
      const f = await db.policyDocumentFile.findUniqueOrThrow({ where: { policyDocumentId: d.id } });
      expect(f.passageCount).toBe(passages.length);
    }
  });

  it("deleting the PDF removes file and passages, and deleting the document cascades", async () => {
    const d = await mkDoc("Ingest Delete");
    await ingestPolicyPdf(reviewer, d.id, pdf("Some text here."));
    await expect(deletePolicyPdf(agent, d.id)).rejects.toBeInstanceOf(AuthError);
    await deletePolicyPdf(reviewer, d.id);
    expect(await passageCount(d.id)).toBe(0);
    expect(await loadPolicyPdf(d.id)).toBeNull();
    await ingestPolicyPdf(reviewer, d.id, pdf("Again some text."));
    await db.policyDocument.delete({ where: { id: d.id } });
    expect(await db.policyPassage.count({ where: { policyDocumentId: d.id } })).toBe(0);
    expect(await db.policyDocumentFile.count({ where: { policyDocumentId: d.id } })).toBe(0);
  });
});

describe("searchPolicyPassages", () => {
  it("finds the relevant passage, with its page and document, and respects the limit", async () => {
    const d = await mkDoc("Search Basic");
    await ingestPolicyPdf(reviewer, d.id, pdf("Unrelated opening about parking.", "Pangolin shipments require a signed waiver at delivery."));
    const hits = await searchPolicyPassages(buildSearchTerms(["pangolin waiver"]));
    expect(hits[0]).toMatchObject({ document: "Search Basic", version: "2.1", page: 2, policyDocumentId: d.id });
    expect(hits[0].text).toContain("signed waiver");
    expect(await searchPolicyPassages(["pangolin", "waiver", "parking"], [], 1)).toHaveLength(1);
  });

  it("ignores inactive documents", async () => {
    const d = await mkDoc("Search Inactive", { activeStatus: false });
    await ingestPolicyPdf(reviewer, d.id, pdf("Axolotl tanks are covered by this inactive policy."));
    expect(await searchPolicyPassages(["axolotl"])).toEqual([]);
    await db.policyDocument.update({ where: { id: d.id }, data: { activeStatus: true } });
    expect((await searchPolicyPassages(["axolotl"])).length).toBe(1);
  });

  it("ranks documents linked to the matched rules higher", async () => {
    const a = await mkDoc("Search Rank A");
    const b = await mkDoc("Search Rank B");
    await ingestPolicyPdf(reviewer, a.id, pdf("Capybara claims need a photo."));
    await ingestPolicyPdf(reviewer, b.id, pdf("Capybara claims need a photo."));
    const unlinked = await searchPolicyPassages(["capybara"], []);
    expect(unlinked).toHaveLength(2);
    const linkedB = await searchPolicyPassages(["capybara"], [b.id]);
    expect(linkedB[0].policyDocumentId).toBe(b.id);
    expect(linkedB[0].score).toBeGreaterThan(linkedB[1].score);
  });

  it("returns nothing for no usable terms and is safe against injection-looking terms", async () => {
    expect(await searchPolicyPassages([])).toEqual([]);
    expect(await searchPolicyPassages(["'; drop table \"PolicyPassage\"; --", "a b"])).toEqual([]);
    expect(await db.policyPassage.count()).toBeGreaterThan(0); // table still there
  });
});

describe("citations on proposals", () => {
  const mkRuleFor = async (policyId: string) => {
    const r = await db.rule.create({ data: { ruleName: "Wombat rule", triggerType: "missing_item", requiredEvidence: "wombat photo", linkedPolicyDocumentId: policyId } });
    ruleIds.push(r.id);
  };
  const llm = {
    summarize: async () => ({ customerLanguage: "en", internalEnglishSummary: "Wombat parcel never arrived." }),
    classify: async () => ({ caseType: "missing_item" as const, priority: "medium" as const, confidence: 0.9 }),
  };
  const proposal = { recommendation: "Replace item", rationale: "r", confidence: 0.8, customerImpact: "m", businessExposure: "m", policySource: "p", needsHumanApproval: true, customerReplyDraft: "x" };

  it("shows the AI only retrieved passages, snapshots cited ones verbatim, and drops invented ids", async () => {
    const d = await mkDoc("Citation Policy");
    await ingestPolicyPdf(reviewer, d.id, pdf("Wombat parcels that never arrive are replaced after a carrier investigation."));
    await mkRuleFor(d.id);
    let seen: ProposalContext | undefined;
    const c = await createCase(agent, { source: "email", customerName: "Cite", complaintText: "Wombat parcel never arrived" }, llm, {
      generate: async (ctx) => {
        seen = ctx;
        return { ...proposal, citedExcerptIds: [ctx.policyExcerpts[0].id, "made-up-id"] };
      },
    });
    caseIds.push(c.id);

    expect(seen!.policyExcerpts.length).toBeGreaterThan(0);
    expect(seen!.policyExcerpts[0]).toMatchObject({ document: "Citation Policy", version: "2.1", page: 1 });
    const p = await db.resolutionProposal.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    const cited = p.citations as { passageId: string; document: string; page: number; excerpt: string }[];
    expect(cited).toHaveLength(1);
    expect(cited[0]).toMatchObject({ document: "Citation Policy", version: "2.1", page: 1, excerpt: seen!.policyExcerpts[0].text });
    const note = (await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "resolution_proposal_generated" } })).notes!;
    expect(note).toMatch(/1 policy excerpt\(s\) cited of \d+ retrieved/);
    expect(note).toContain("1 cited id(s) were not among the retrieved excerpts and were dropped");

    // The snapshot is history: replacing the PDF later does not rewrite it.
    await ingestPolicyPdf(reviewer, d.id, pdf("Completely different wording now."));
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: p.id } })).citations).toEqual(cited);
  });

  it("records an empty citation list when nothing is cited, and when no policy PDFs exist", async () => {
    const d = await mkDoc("Citation Empty");
    await mkRuleFor(d.id); // rule exists, but this document has no PDF
    const c = await createCase(agent, { source: "email", customerName: "NoCite", complaintText: "Wombat parcel never arrived" }, llm, { generate: async () => proposal });
    caseIds.push(c.id);
    const p = await db.resolutionProposal.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    expect(p.citations).toEqual([]);
  });
});
