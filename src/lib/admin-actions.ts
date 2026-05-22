"use server";

import { revalidatePath } from "next/cache";
import type { ApiKeyScope, Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgAdmin, requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { generateApiKey } from "@/lib/apikeys";
import { defaultOrgSettingsData } from "@/lib/engine-config";
import { slugify } from "@/lib/utils";
import { DEFAULT_RUBRIC } from "@/engine/rubric";

// ─────────────────────── Access control ───────────────────────

export async function addDomain(formData: FormData) {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) return;
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return;
  await prisma.whitelistedDomain
    .create({ data: { organizationId: admin.organizationId, domain } })
    .catch(() => undefined);
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "domain.add",
    target: domain,
  });
  revalidatePath("/admin/access");
}

export async function removeDomain(formData: FormData) {
  const admin = await requireOrgAdmin();
  const id = String(formData.get("id") ?? "");
  const domain = await prisma.whitelistedDomain.findUnique({ where: { id } });
  if (!domain || domain.organizationId !== admin.organizationId) return;
  await prisma.whitelistedDomain.delete({ where: { id } });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "domain.remove",
    target: domain.domain,
  });
  revalidatePath("/admin/access");
}

export async function addEmail(formData: FormData) {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) return;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const grantsAdmin = formData.get("grantsAdmin") === "on";
  if (!email || !email.includes("@")) return;
  await prisma.whitelistedEmail
    .create({ data: { organizationId: admin.organizationId, email, grantsAdmin } })
    .catch(() => undefined);
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "email.add",
    target: email,
    metadata: { grantsAdmin },
  });
  revalidatePath("/admin/access");
}

export async function removeEmail(formData: FormData) {
  const admin = await requireOrgAdmin();
  const id = String(formData.get("id") ?? "");
  const email = await prisma.whitelistedEmail.findUnique({ where: { id } });
  if (!email || email.organizationId !== admin.organizationId) return;
  await prisma.whitelistedEmail.delete({ where: { id } });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "email.remove",
    target: email.email,
  });
  revalidatePath("/admin/access");
}

export async function setUserRole(formData: FormData) {
  const admin = await requireOrgAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!["ORG_ADMIN", "REVIEWER"].includes(role)) return;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.organizationId !== admin.organizationId) return;
  if (target.role === "SUPER_ADMIN") return; // never demote a platform admin here
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "user.role",
    target: target.email,
    metadata: { role },
  });
  revalidatePath("/admin/access");
}

export async function setUserStatus(formData: FormData) {
  const admin = await requireOrgAdmin();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "") as UserStatus;
  if (!["ACTIVE", "DISABLED"].includes(status)) return;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.organizationId !== admin.organizationId) return;
  if (target.id === admin.id) return; // cannot disable yourself
  await prisma.user.update({ where: { id: userId }, data: { status } });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "user.status",
    target: target.email,
    metadata: { status },
  });
  revalidatePath("/admin/access");
}

// ─────────────────────── API keys ───────────────────────

export async function createApiKey(
  name: string,
  scope: ApiKeyScope,
): Promise<{ plaintext: string; prefix: string } | { error: string }> {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) return { error: "No organization." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "A key name is required." };

  const key = generateApiKey();
  await prisma.apiKey.create({
    data: {
      organizationId: admin.organizationId,
      name: trimmed,
      prefix: key.prefix,
      hashedKey: key.hashed,
      scope: scope === "READ_ONLY" ? "READ_ONLY" : "FULL",
      createdById: admin.id,
    },
  });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "apikey.create",
    target: trimmed,
    metadata: { scope },
  });
  revalidatePath("/admin/api-keys");
  return { plaintext: key.plaintext, prefix: key.prefix };
}

export async function revokeApiKey(formData: FormData) {
  const admin = await requireOrgAdmin();
  const id = String(formData.get("id") ?? "");
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.organizationId !== admin.organizationId || key.revokedAt) return;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "apikey.revoke",
    target: key.name,
  });
  revalidatePath("/admin/api-keys");
}

// ─────────────────────── AI settings + rubric ───────────────────────

function parseLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumber(value: FormDataEntryValue | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function updateSettings(formData: FormData) {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) return;

  const data = {
    geminiModel: String(formData.get("geminiModel") ?? "gemini-3.5-flash").trim(),
    temperature: parseNumber(formData.get("temperature"), 0.2),
    maxOutputTokens: Math.round(parseNumber(formData.get("maxOutputTokens"), 16384)),
    mandatorySections: parseLines(formData.get("mandatorySections")),
    recommendedSections: parseLines(formData.get("recommendedSections")),
    requirementCategories: parseLines(formData.get("requirementCategories")),
    riskCategories: parseLines(formData.get("riskCategories")),
    scoreWeights: {
      completeness: parseNumber(formData.get("weightCompleteness"), 0.45),
      coverage: parseNumber(formData.get("weightCoverage"), 0.4),
      risk: parseNumber(formData.get("weightRisk"), 0.15),
    },
    verdictThresholds: {
      ready: Math.round(parseNumber(formData.get("thresholdReady"), 80)),
      needsRevision: Math.round(parseNumber(formData.get("thresholdRevision"), 55)),
    },
    langfuseEnabled: formData.get("langfuseEnabled") === "on",
  };

  // Guard against an empty mandatory list — it would disable the hard cap.
  if (data.mandatorySections.length === 0) {
    data.mandatorySections = DEFAULT_RUBRIC.mandatorySections;
  }

  await prisma.orgSettings.upsert({
    where: { organizationId: admin.organizationId },
    update: data,
    create: { organizationId: admin.organizationId, ...data },
  });
  await logAudit({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "settings.update",
    target: "org settings",
  });
  revalidatePath("/admin/settings");
}

// ─────────────────────── Platform: organizations ───────────────────────

export async function createOrganization(formData: FormData) {
  await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim().toLowerCase();
  if (!name) return;

  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      settings: { create: defaultOrgSettingsData() },
      whitelistedDomains:
        domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)
          ? { create: { domain } }
          : undefined,
      whitelistedEmails: adminEmail.includes("@")
        ? { create: { email: adminEmail, grantsAdmin: true } }
        : undefined,
    },
  });
  await logAudit({
    organizationId: org.id,
    action: "org.create",
    target: name,
    metadata: { domain, adminEmail },
  });
  revalidatePath("/platform");
}

export async function setOrganizationStatus(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ACTIVE", "SUSPENDED"].includes(status)) return;
  await prisma.organization.update({
    where: { id },
    data: { status: status as "ACTIVE" | "SUSPENDED" },
  });
  await logAudit({ organizationId: id, action: "org.status", metadata: { status } });
  revalidatePath("/platform");
}
