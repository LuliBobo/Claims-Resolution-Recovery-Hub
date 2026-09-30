import type { Prisma } from "@/generated/prisma/client";
import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { caseFilterInput, caseUpdateInput } from "@/lib/validation/case";

export async function listCases(raw: unknown = {}) {
  const f = caseFilterInput.parse(raw);
  const where: Prisma.CustomerCaseWhereInput = {
    status: f.status,
    priority: f.priority,
    caseType: f.caseType,
    source: f.source,
    ...(f.q
      ? {
          OR: [
            { customerName: { contains: f.q, mode: "insensitive" } },
            { customerEmail: { contains: f.q, mode: "insensitive" } },
            { orderReference: { contains: f.q, mode: "insensitive" } },
            { complaintText: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return db.customerCase.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
}

export function getCase(id: string) {
  return db.customerCase.findUnique({
    where: { id },
    include: {
      order: true,
      shipment: true,
      attachments: { orderBy: { createdAt: "asc" } },
      auditEvents: { orderBy: { eventTime: "asc" } },
      resolutionProposals: { orderBy: { createdAt: "asc" }, include: { approvals: true } },
      recoveryDrafts: { orderBy: { createdAt: "asc" }, include: { approvals: true } },
    },
  });
}

/** Manual edit. Status changes are audit-logged as previous -> new. */
export async function updateCase(actor: Actor | null, id: string, raw: unknown) {
  const user = requireRole(actor, ...ANY_ROLE);
  const input = caseUpdateInput.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.customerCase.findUniqueOrThrow({ where: { id } });
    const after = await tx.customerCase.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === "resolved" && before.status !== "resolved" ? { resolvedAt: new Date() } : {}),
      },
    });
    for (const field of ["status", "priority", "caseType", "assignedReviewer"] as const) {
      if (input[field] !== undefined && before[field] !== after[field]) {
        await logAuditEvent(
          {
            caseId: id,
            actor: user.email,
            action: field === "status" ? "status_changed" : `${field}_changed`,
            previousState: before[field] ?? null,
            newState: after[field] ?? null,
          },
          tx,
        );
      }
    }
    return after;
  });
}
