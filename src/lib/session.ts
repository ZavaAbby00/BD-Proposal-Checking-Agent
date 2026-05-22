import { cache } from "react";
import { redirect } from "next/navigation";
import type { Organization, User } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type DbUser = User & { organization: Organization | null };

/** The lightweight session user (from the JWT) — no database access. */
export const getSessionUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

/**
 * The full, fresh database user (role, status, organization). Returns null when
 * not signed in or the account has been disabled — this is where the disabled
 * check is genuinely enforced (the JWT alone could be stale).
 */
export const getDbUser = cache(async (): Promise<DbUser | null> => {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: { organization: true },
  });
  if (!user || user.status === "DISABLED") return null;
  return user;
});

/** Require a signed-in, enabled user — redirects to sign-in otherwise. */
export async function requireUser(): Promise<DbUser> {
  const user = await getDbUser();
  if (!user) redirect("/signin");
  return user;
}

/** Require org-admin or super-admin. */
export async function requireOrgAdmin(): Promise<DbUser> {
  const user = await requireUser();
  if (user.role !== "ORG_ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }
  return user;
}

/** Require platform super-admin. */
export async function requireSuperAdmin(): Promise<DbUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return user;
}
