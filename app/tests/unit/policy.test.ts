import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/pdf-build";
import { buildSearchTerms, chunkPages, MAX_CHARS } from "@/server/policy/chunk";
import { resolveCitations, type PolicyExcerpt } from "@/server/policy/citations";
import { extractPdfPages, PdfError } from "@/server/policy/extract-pdf";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe("chunkPages", () => {
  it("keeps 1-based page numbers, skips empty pages and numbers passages per page", () => {
    const out = chunkPages(["First page. Two sentences.", "   ", "Third page text."]);
    expect(out.map((p) => [p.page, p.ordinal])).toEqual([[1, 0], [3, 0]]);
  });

  it("never exceeds MAX_CHARS, even for one huge sentence, and loses no words", () => {
    const long = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" "); // one 4000+ char sentence
    const text = `Intro sentence. ${long}. Closing sentence here.`;
    const out = chunkPages([text]);
    expect(out.length).toBeGreaterThan(2);
    for (const p of out) expect(p.text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(out.map((p) => p.text).join(" ")).toBe(squash(text)); // contiguous, in order, verbatim
  });

  it("splits a long page into passages of roughly the target size at sentence boundaries", () => {
    const sentence = "This sentence is exactly the kind of ordinary policy text we expect to see.";
    const out = chunkPages([Array(40).fill(sentence).join(" ")]);
    expect(out.length).toBeGreaterThan(2);
    for (const p of out) expect(p.text.endsWith(".")).toBe(true);
  });

  it("returns nothing for no text", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages(["", "  \n "])).toEqual([]);
  });
});

describe("buildSearchTerms", () => {
  it("lowercases, drops short, numeric and common words, orders by frequency, and caps", () => {
    expect(buildSearchTerms(["Damaged damaged DAMAGED vase", "the and for vase 12345 ab", null, undefined])).toEqual(["damaged", "vase"]);
    expect(buildSearchTerms([Array.from({ length: 50 }, (_, i) => `term${i}x`).join(" ")], 25)).toHaveLength(25);
  });
  it("only ever yields letters and digits (safe to place in a tsquery)", () => {
    const terms = buildSearchTerms(["foo'; DROP TABLE x;-- | & ! ( ) bar:*"]);
    for (const t of terms) expect(t).toMatch(/^[a-z0-9]+$/);
    expect(terms).toEqual(expect.arrayContaining(["foo", "drop", "table", "bar"]));
  });
});

describe("resolveCitations", () => {
  const offered: PolicyExcerpt[] = [
    { id: "a", document: "SOP", version: "1.0", page: 2, text: "Required evidence text." },
    { id: "b", document: "Returns", version: null, page: 1, text: "Return window text." },
  ];
  it("turns cited ids into verbatim snapshots, in order, once each", () => {
    const { citations, ignored } = resolveCitations(["b", "a", "b"], offered);
    expect(citations).toEqual([
      { passageId: "b", document: "Returns", version: null, page: 1, excerpt: "Return window text." },
      { passageId: "a", document: "SOP", version: "1.0", page: 2, excerpt: "Required evidence text." },
    ]);
    expect(ignored).toBe(0);
  });
  it("drops ids the AI was never shown, so it cannot cite or invent text", () => {
    const { citations, ignored } = resolveCitations(["zzz", "a"], offered);
    expect(citations.map((c) => c.passageId)).toEqual(["a"]);
    expect(ignored).toBe(1);
  });
  it("handles no citations", () => {
    expect(resolveCitations(undefined, offered)).toEqual({ citations: [], ignored: 0 });
    expect(resolveCitations([], [])).toEqual({ citations: [], ignored: 0 });
  });
});

describe("PDF extraction", () => {
  it("round-trips a generated multi-page PDF page by page", async () => {
    const pdf = buildTextPdf(["Page one says alpha.", "Page two says (beta) and back\\slash.", ""]);
    const r = await extractPdfPages(pdf);
    expect(r.pageCount).toBe(3);
    expect(r.pages[0]).toContain("Page one says alpha.");
    expect(r.pages[1]).toContain("Page two says (beta) and back\\slash.");
    expect(r.emptyPages).toBe(1); // a page without text is counted, not silently dropped
  });

  it("reads a real-world PDF from the repository", async () => {
    const file = path.resolve(process.cwd(), "../complaint_recovery_risk_report.pdf");
    if (!existsSync(file)) return;
    const r = await extractPdfPages(new Uint8Array(readFileSync(file)));
    expect(r.pageCount).toBe(6);
    expect(r.pages.join(" ")).toContain("Risk Report");
  });

  it("rejects bytes that are not a readable PDF", async () => {
    await expect(extractPdfPages(new TextEncoder().encode("%PDF-1.4 definitely not a pdf"))).rejects.toBeInstanceOf(PdfError);
  });
});
