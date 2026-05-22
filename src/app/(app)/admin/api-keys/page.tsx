import { requireOrgAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { CreateApiKey } from "@/components/admin/create-api-key";
import { revokeApiKey } from "@/lib/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">No organization.</Card>
    );
  }

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <CreateApiKey />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keys</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {keys.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No keys yet.</p>
          )}
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-muted-foreground">
                  <code>{k.prefix}…</code> · created {formatDate(k.createdAt)} ·
                  last used {formatDate(k.lastUsedAt)}
                </div>
              </div>
              <Badge variant={k.scope === "FULL" ? "default" : "secondary"}>
                {k.scope === "FULL" ? "Full" : "Read only"}
              </Badge>
              {k.revokedAt ? (
                <Badge variant="destructive">Revoked</Badge>
              ) : (
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Revoke
                  </Button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connecting an MCP client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Point any MCP client at the Streamable HTTP endpoint:</p>
          <code className="block overflow-x-auto rounded bg-secondary px-2 py-1.5 text-xs text-foreground">
            {env.appUrl()}/api/mcp/mcp
          </code>
          <p>
            Send the key as a bearer token:{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs text-foreground">
              Authorization: Bearer &lt;key&gt;
            </code>
          </p>
          <p>
            For local desktop clients, run the stdio server with{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs text-foreground">
              MCP_API_KEY=&lt;key&gt; npm run mcp:stdio
            </code>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
