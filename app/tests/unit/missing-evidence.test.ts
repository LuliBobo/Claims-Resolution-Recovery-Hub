import { describe, expect, it } from "vitest";
import { describeMissingEvidence, type MissingEvidenceInput } from "@/server/evidence/missing-evidence";

type Att = MissingEvidenceInput["attachments"][number];
const att = (over: Partial<Att>): Att => ({ fileName: "f.png", category: "shipping_label", photoSubject: null, evidenceStatus: "sufficient", evidenceReason: null, ...over });
const base: MissingEvidenceInput = { gate: { applies: false, missing: [] }, attachments: [], ruleRequiredEvidence: [], reviewerNote: null };
const text = (i: Partial<MissingEvidenceInput>) => describeMissingEvidence({ ...base, ...i }).map((x) => x.text);

describe("describeMissingEvidence", () => {
  it("is empty when nothing is missing", () => {
    expect(text({})).toEqual([]);
  });

  it("lists each missing carrier-claim item when the gate applies", () => {
    expect(text({ gate: { applies: true, missing: ["shipping label photo", "outer carton photo"] } })).toEqual([
      "Shipping label photo (missing or not clear enough)",
      "Outer carton photo (missing or not clear enough)",
    ]);
  });

  it("without the gate and without attachments, lists the rules' required evidence once", () => {
    expect(text({ ruleRequiredEvidence: ["Photo of the item", " Photo of the item ", "", "Packing slip"] })).toEqual([
      "Required: Photo of the item",
      "Required: Packing slip",
    ]);
  });

  it("does not ask for rule evidence once something is attached", () => {
    const attachments = [att({ category: "photo_evidence", photoSubject: "item" })];
    expect(text({ ruleRequiredEvidence: ["Photo of the item"], attachments })).toEqual([]);
  });

  it("explains insufficient attachments with the stored reason, and ignores sufficient or pending ones", () => {
    const photo = (fileName: string, evidenceStatus: Att["evidenceStatus"], evidenceReason: string | null, photoSubject: Att["photoSubject"]) =>
      att({ fileName, category: "photo_evidence", photoSubject, evidenceStatus, evidenceReason });
    expect(text({ attachments: [
      photo("l.png", "insufficient", "Photo is not clear enough to assess.", "item"),
      photo("ok.png", "sufficient", null, "outer_carton"),
      photo("p.png", "pending_review", null, "other"),
      photo("x.png", "insufficient", null, "other"),
    ] })).toEqual([
      "l.png (photo): Photo is not clear enough to assess.",
      "x.png (photo): not sufficient",
    ]);
  });

  it("an insufficient file is no longer a gap once a sufficient file covers the same slot", () => {
    const bad = att({ fileName: "bad.png", evidenceStatus: "insufficient", evidenceReason: "Label is missing: ship date." });
    expect(text({ attachments: [bad] })).toHaveLength(1);
    expect(text({ attachments: [bad, att({ fileName: "good.png" })] })).toEqual([]);
    // a sufficient photo of a different subject does not cover it
    const badItem = att({ fileName: "item.png", category: "photo_evidence", photoSubject: "item", evidenceStatus: "insufficient", evidenceReason: "Photo does not show the damage." });
    const goodCarton = att({ fileName: "box.png", category: "photo_evidence", photoSubject: "outer_carton" });
    expect(text({ attachments: [badItem, goodCarton] })).toEqual(["item.png (photo): Photo does not show the damage."]);
  });

  it("appends the reviewer's note, ignoring a blank one", () => {
    expect(text({ reviewerNote: "  Please add the receipt  " })).toEqual(["Please add the receipt"]);
    expect(text({ reviewerNote: "   " })).toEqual([]);
  });

  it("tags each item with its kind", () => {
    const items = describeMissingEvidence({ ...base, gate: { applies: true, missing: ["damaged item photo"] }, reviewerNote: "n" });
    expect(items.map((i) => i.kind)).toEqual(["required", "reviewer"]);
  });
});
