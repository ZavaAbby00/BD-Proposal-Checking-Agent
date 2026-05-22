import { requireOrgAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No organization.
      </Card>
    );
  }

  const entries = await prisma.auditLog.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit log</CardTitle>
        <p className="text-sm text-muted-foreground">
          The 100 most recent actions in this organization.
        </p>
      </CardHeader>
      <CardContent className="divide-y">
        {entries.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No activity yet.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
              {e.action}
            </code>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {e.target ?? "—"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {e.actor?.name ?? e.actor?.email ?? "system"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDate(e.createdAt)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
