import { X } from "lucide-react";
import { requireOrgAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  addDomain,
  removeDomain,
  addEmail,
  removeEmail,
  setUserRole,
  setUserStatus,
} from "@/lib/admin-actions";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Create an organization in the Platform panel first.
      </Card>
    );
  }
  const orgId = admin.organizationId;

  const [domains, emails, users] = await Promise.all([
    prisma.whitelistedDomain.findMany({
      where: { organizationId: orgId },
      orderBy: { domain: "asc" },
    }),
    prisma.whitelistedEmail.findMany({
      where: { organizationId: orgId },
      orderBy: { email: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      {/* Whitelisted domains */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Whitelisted domains</CardTitle>
          <p className="text-sm text-muted-foreground">
            Anyone signing in with a Google account on these domains joins this
            organization.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y">
            {domains.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">No domains yet.</p>
            )}
            {domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">{d.domain}</span>
                <form action={removeDomain}>
                  <input type="hidden" name="id" value={d.id} />
                  <Button variant="ghost" size="sm" type="submit">
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            ))}
          </div>
          <form action={addDomain} className="flex gap-2">
            <Input name="domain" placeholder="example.com" className="max-w-xs" />
            <Button type="submit" variant="outline" size="sm">
              Add domain
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Whitelisted emails */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Whitelisted emails</CardTitle>
          <p className="text-sm text-muted-foreground">
            Individual exceptions — useful for external collaborators. Tick
            &ldquo;admin&rdquo; to grant org-admin rights.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y">
            {emails.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">No emails yet.</p>
            )}
            {emails.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {e.email}
                  {e.grantsAdmin && <Badge variant="secondary">admin</Badge>}
                </span>
                <form action={removeEmail}>
                  <input type="hidden" name="id" value={e.id} />
                  <Button variant="ghost" size="sm" type="submit">
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            ))}
          </div>
          <form action={addEmail} className="flex flex-wrap items-center gap-2">
            <Input
              name="email"
              type="email"
              placeholder="person@example.com"
              className="max-w-xs"
            />
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input type="checkbox" name="grantsAdmin" /> admin
            </label>
            <Button type="submit" variant="outline" size="sm">
              Add email
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
          <p className="text-sm text-muted-foreground">
            People who have signed in. Adjust roles or disable accounts.
          </p>
        </CardHeader>
        <CardContent className="divide-y">
          {users.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No users yet.</p>
          )}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{u.name ?? u.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email} · last seen {formatDate(u.lastLoginAt)}
                </div>
              </div>
              {u.role === "SUPER_ADMIN" ? (
                <Badge variant="default">platform admin</Badge>
              ) : (
                <form action={setUserRole} className="flex items-center gap-1.5">
                  <input type="hidden" name="userId" value={u.id} />
                  <select
                    name="role"
                    defaultValue={u.role}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="REVIEWER">Reviewer</option>
                    <option value="ORG_ADMIN">Org admin</option>
                  </select>
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>
              )}
              {u.id !== admin.id && u.role !== "SUPER_ADMIN" && (
                <form action={setUserStatus}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={u.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
                  />
                  <Button
                    type="submit"
                    variant={u.status === "ACTIVE" ? "ghost" : "outline"}
                    size="sm"
                  >
                    {u.status === "ACTIVE" ? "Disable" : "Enable"}
                  </Button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
