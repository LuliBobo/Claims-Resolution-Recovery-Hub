// Pure. The AI may only cite excerpt ids it was shown. Each cited id is resolved to the stored text
// and snapshotted, so a citation is always real document text, never something the AI wrote, and
// later edits to the document never rewrite a past proposal.

export interface PolicyExcerpt {
  id: string;
  document: string;
  version: string | null;
  page: number;
  text: string;
}

export interface Citation {
  passageId: string;
  document: string;
  version: string | null;
  page: number;
  excerpt: string;
}

export function resolveCitations(citedIds: readonly string[] | undefined, offered: readonly PolicyExcerpt[]): { citations: Citation[]; ignored: number } {
  const byId = new Map(offered.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const citations: Citation[] = [];
  let ignored = 0;
  for (const id of citedIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = byId.get(id);
    if (!e) {
      ignored++; // an id the AI was never shown
      continue;
    }
    citations.push({ passageId: e.id, document: e.document, version: e.version, page: e.page, excerpt: e.text });
  }
  return { citations, ignored };
}
