import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/apikeys";

/** The organization an MCP request is acting on behalf of. */
export type OrgContext = {
  organizationId: string;
  scope: "READ_ONLY" | "FULL";
};

/**
 * Validate an MCP bearer token against the organization API keys.
 * Returns AuthInfo (carrying the org context in `extra`) or undefined → 401.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashApiKey(bearerToken) },
    include: { organization: true },
  });
  if (!key || key.revokedAt) return undefined;
  if (key.organization.status === "SUSPENDED") return undefined;

  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    token: bearerToken,
    clientId: key.id,
    scopes: key.scope === "FULL" ? ["proposal:read", "proposal:write"] : ["proposal:read"],
    extra: { organizationId: key.organizationId, scope: key.scope },
  } as AuthInfo;
}

/** Extract the org context from the MCP request's auth info. */
export function orgFromExtra(extra: unknown): OrgContext {
  const authInfo = (extra as { authInfo?: AuthInfo } | undefined)?.authInfo;
  const data = authInfo?.extra as
    | { organizationId?: string; scope?: string }
    | undefined;
  if (!data?.organizationId) {
    throw new Error("Unauthenticated — a valid organization API key is required.");
  }
  return {
    organizationId: data.organizationId,
    scope: data.scope === "READ_ONLY" ? "READ_ONLY" : "FULL",
  };
}
