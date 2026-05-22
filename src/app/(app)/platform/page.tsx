import { requireSuperAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createOrganization, setOrganizationStatus } from "@/lib/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  await requireSuperAdmin();

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      whitelistedDomains: true,
      _count: { select: { users: true, reviews: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
        <p className="text-sm text-muted-foreground">
          Manage organizations across the platform. Break-glass super-admins:{" "}
          <code className="text-xs">{env.superadminEmails().join(", ") || "none"}</code>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create organization</CardTitle>
          <p className="text-sm text-muted-foreground">
            Seeds the organization with default review settings, a whitelisted
            domain, and a first org admin.
          </p>
        </CardHeader>
        <CardContent>
          <form
            action={createOrganization}
            className="grid gap-3 sm:grid-cols-4 sm:items-end"
          >
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input name="name" placeholder="Acme Corp" required />
            </div>
            <div className="space-y-1.5">
              <Label>Domain</Label>
              <Input name="domain" placeholder="acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label>First admin email</Label>
              <Input name="adminEmail" type="email" placeholder="admin@acme.com" />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organizations</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {organizations.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No organizations yet.
            </p>
          )}
          {organizations.map((org) => (
            <div key={org.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {org.name}
                  {org.status === "SUSPENDED" && (
                    <Badge variant="destructive">Suspended</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {org.whitelistedDomains.map((d) => d.domain).join(", ") ||
                    "no domains"}{" "}
                  · {org._count.users} users · {org._count.reviews} reviews ·
                  created {formatDate(org.createdAt)}
                </div>
              </div>
              <form action={setOrganizationStatus}>
                <input type="hidden" name="id" value={org.id} />
                <input
                  type="hidden"
                  name="status"
                  value={org.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                />
                <Button type="submit" variant="outline" size="sm">
                  {org.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                </Button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
