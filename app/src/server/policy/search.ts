import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { PolicyExcerpt } from "./citations";

type Client = Prisma.TransactionClient | typeof db;

export interface PassageHit extends PolicyExcerpt {
  policyDocumentId: string;
  score: number;
}

/**
 * Deterministic retrieval: Postgres full-text search over the passages of ACTIVE policy documents.
 * Any search word may match (OR); ranking is ts_rank_cd, doubled for documents linked to the case's
 * matched rules. No AI is involved in ranking. `terms` come from buildSearchTerms (alphanumerics only).
 */
export async function searchPolicyPassages(terms: readonly string[], linkedPolicyDocumentIds: readonly string[] = [], limit = 6, client: Client = db): Promise<PassageHit[]> {
  const safe = terms.filter((t) => /^[a-z0-9]+$/.test(t));
  if (safe.length === 0) return [];
  const tsquery = safe.join(" | ");
  const rows = await client.$queryRaw<{ id: string; policyDocumentId: string; document: string; version: string | null; page: number; text: string; score: number }[]>(Prisma.sql`
    SELECT p.id, p."policyDocumentId", d.name AS document, d.version, p.page, p.text,
           ts_rank_cd(to_tsvector('english', p.text), q.query)::float8
             * CASE WHEN p."policyDocumentId" = ANY(${[...linkedPolicyDocumentIds]}::text[]) THEN 2 ELSE 1 END AS score
    FROM "PolicyPassage" p
    JOIN "PolicyDocument" d ON d.id = p."policyDocumentId" AND d."activeStatus"
    CROSS JOIN to_tsquery('english', ${tsquery}) AS q(query)
    WHERE to_tsvector('english', p.text) @@ q.query
    ORDER BY score DESC, d.name, p.page, p.ordinal
    LIMIT ${limit}`);
  return rows.map((r) => ({ id: r.id, policyDocumentId: r.policyDocumentId, document: r.document, version: r.version, page: r.page, text: r.text, score: Number(r.score) }));
}
