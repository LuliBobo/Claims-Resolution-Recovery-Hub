import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Tx = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  caseId: string;
  actor: string;
  action: string;
  previousState?: string | null;
  newState?: string | null;
  ruleSource?: string | null;
  notes?: string | null;
}

/**
 * Every mutation logs through this helper. Pass the surrounding transaction client so the
 * audit row commits or rolls back with the change it describes.
 */
export function logAuditEvent(input: AuditInput, tx: Tx = db) {
  return tx.auditEvent.create({
    data: {
      linkedCaseId: input.caseId,
      actor: input.actor,
      action: input.action,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      ruleSource: input.ruleSource ?? null,
      notes: input.notes ?? null,
    },
  });
}
