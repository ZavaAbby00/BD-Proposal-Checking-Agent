import { prisma } from "@/lib/db";

/**
 * Append an entry to the audit log. Audit failures must never break the
 * operation being audited, so errors are swallowed.
 */
export async function logAudit(entry: {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        target: entry.target ?? null,
        metadata: entry.metadata ? (entry.metadata as object) : undefined,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write audit log:", e);
  }
}
