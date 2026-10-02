// Pure. Splits per-page PDF text into passages for search and citation. Passages are contiguous
// runs of the page's own sentences with whitespace normalised (so an excerpt is real, in-order
// document text, never a paraphrase). Page numbers are 1-based.

export const TARGET_CHARS = 600;
export const MAX_CHARS = 1100;

export interface PassageDraft {
  page: number;
  ordinal: number;
  text: string;
}

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

/** Splits one over-long sentence at word boundaries so no passage exceeds MAX_CHARS. */
function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_CHARS) return [sentence];
  const out: string[] = [];
  let cur = "";
  for (const word of sentence.split(" ")) {
    if (cur && cur.length + 1 + word.length > MAX_CHARS) {
      out.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  return out;
}

export function chunkPages(pages: readonly string[]): PassageDraft[] {
  const passages: PassageDraft[] = [];
  pages.forEach((raw, i) => {
    const text = normalise(raw);
    if (!text) return;
    // Sentence-ish units; text without terminal punctuation stays one unit.
    const units = text.split(/(?<=[.!?:;])\s+/).flatMap(splitLong);
    let cur = "";
    let ordinal = 0;
    const flush = () => {
      if (cur) passages.push({ page: i + 1, ordinal: ordinal++, text: cur });
      cur = "";
    };
    for (const u of units) {
      if (cur && (cur.length >= TARGET_CHARS || cur.length + 1 + u.length > MAX_CHARS)) flush();
      cur = cur ? `${cur} ${u}` : u;
    }
    flush();
  });
  return passages;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "have", "has", "was", "were", "are", "not", "but", "his", "her", "its", "they", "their", "item", "case", "customer"]);

/**
 * Pure. Turns free text (case summary, type, rule names...) into a bounded list of search words:
 * lowercase alphanumerics, at least 3 letters, common words dropped, most frequent first.
 */
export function buildSearchTerms(parts: readonly (string | null | undefined)[], max = 25): string[] {
  const counts = new Map<string, number>();
  for (const part of parts) {
    for (const w of (part ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([w]) => w);
}
