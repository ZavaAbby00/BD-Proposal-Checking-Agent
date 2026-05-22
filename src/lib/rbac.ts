import type { Role } from "@prisma/client";

/** Role helpers — a single source of truth for authorization checks. */

export function isSuperAdmin(role: Role | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

/** Can administer an organization (org settings, users, API keys, rubric). */
export function isOrgAdmin(role: Role | undefined | null): boolean {
  return role === "SUPER_ADMIN" || role === "ORG_ADMIN";
}

/** Can run and read reviews. */
export function isReviewer(role: Role | undefined | null): boolean {
  return role === "SUPER_ADMIN" || role === "ORG_ADMIN" || role === "REVIEWER";
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertOrgAdmin(role: Role | undefined | null): void {
  if (!isOrgAdmin(role)) throw new AuthorizationError();
}

export function assertSuperAdmin(role: Role | undefined | null): void {
  if (!isSuperAdmin(role)) throw new AuthorizationError("Platform administrator access required.");
}
