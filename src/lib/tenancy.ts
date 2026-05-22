import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { Role } from "@prisma/client";

/**
 * Maps a signed-in email to an organization and role. This is the multi-tenant
 * gate: a user with no match is denied access entirely.
 *
 * Resolution order:
 *   1. SUPERADMIN_EMAILS env  → SUPER_ADMIN (break-glass platform operator)
 *   2. whitelisted domain     → joins that organization
 *   3. whitelisted email      → joins that organization
 * An admin grant (ORG_ADMIN) comes from a WhitelistedEmail with grantsAdmin.
 */
export type AccessGrant = {
  role: Role;
  organizationId: string | null;
};

export async function resolveAccess(email: string): Promise<AccessGrant | null> {
  const lower = email.trim().toLowerCase();
  if (!lower || !lower.includes("@")) return null;

  const isSuper = env.superadminEmails().includes(lower);
  const domain = lower.split("@")[1] ?? "";

  const [emailRule, domainRule] = await Promise.all([
    prisma.whitelistedEmail.findUnique({ where: { email: lower } }),
    domain ? prisma.whitelistedDomain.findUnique({ where: { domain } }) : Promise.resolve(null),
  ]);

  let organizationId: string | null = null;
  let adminGrant = false;

  if (domainRule) {
    organizationId = domainRule.organizationId;
    adminGrant =
      Boolean(emailRule?.grantsAdmin) && emailRule?.organizationId === domainRule.organizationId;
  } else if (emailRule) {
    organizationId = emailRule.organizationId;
    adminGrant = emailRule.grantsAdmin;
  }

  // A suspended organization blocks non-superadmins.
  if (organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org || (org.status === "SUSPENDED" && !isSuper)) {
      organizationId = isSuper ? null : organizationId;
      if (!isSuper) return null;
    }
  }

  if (isSuper) return { role: "SUPER_ADMIN", organizationId };
  if (organizationId) {
    return { role: adminGrant ? "ORG_ADMIN" : "REVIEWER", organizationId };
  }
  return null;
}
