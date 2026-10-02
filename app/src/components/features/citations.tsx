import type { Citation } from "@/server/policy/citations";

/** Policy excerpts a proposal rests on, verbatim from the stored document text. */
export function Citations({ citations }: { citations: unknown }) {
  const list = Array.isArray(citations) ? (citations as Citation[]) : [];
  if (list.length === 0) {
    return <p className="mt-1 text-xs text-muted-foreground">No policy excerpt is cited for this recommendation.</p>;
  }
  return (
    <details className="mt-1 text-sm">
      <summary className="cursor-pointer">Policy excerpts ({list.length})</summary>
      <ul className="mt-1 flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.passageId} className="border-l-2 border-border pl-3">
            <div className="text-xs text-muted-foreground">
              {c.document}
              {c.version ? ` v${c.version}` : ""}, page {c.page}
            </div>
            <blockquote className="whitespace-pre-wrap">{c.excerpt}</blockquote>
          </li>
        ))}
      </ul>
    </details>
  );
}
