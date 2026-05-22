import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { DEFAULT_RUBRIC, normalizeRubric, type Rubric } from "@/engine/rubric";
import type { EngineConfig } from "@/engine/types";

/**
 * Build the engine configuration for an organization from its stored
 * OrgSettings (rubric + model). Falls back to sane defaults when settings are
 * absent so a review can always run.
 */
export async function buildEngineConfig(organizationId: string): Promise<EngineConfig> {
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId } });

  const rubric: Rubric = settings
    ? normalizeRubric({
        mandatorySections: settings.mandatorySections as string[],
        recommendedSections: settings.recommendedSections as string[],
        requirementCategories: settings.requirementCategories as string[],
        riskCategories: settings.riskCategories as string[],
        scoreWeights: settings.scoreWeights as Rubric["scoreWeights"],
        verdictThresholds: settings.verdictThresholds as Rubric["verdictThresholds"],
      })
    : DEFAULT_RUBRIC;

  const langfuseEnabled = env.langfuseEnabled() && (settings?.langfuseEnabled ?? true);

  return {
    organizationId,
    rubric,
    model: {
      model: settings?.geminiModel || env.geminiModel(),
      temperature: settings?.temperature ?? 0.2,
      maxOutputTokens: settings?.maxOutputTokens ?? 16384,
      promptOverrides:
        (settings?.promptOverrides as Record<string, string> | null) ?? undefined,
    },
    langfuse: langfuseEnabled ? { enabled: true, ...env.langfuse() } : undefined,
  };
}

/** The default OrgSettings row payload for a newly-created organization. */
export function defaultOrgSettingsData() {
  return {
    geminiModel: env.geminiModel(),
    temperature: 0.2,
    maxOutputTokens: 16384,
    mandatorySections: DEFAULT_RUBRIC.mandatorySections,
    recommendedSections: DEFAULT_RUBRIC.recommendedSections,
    requirementCategories: DEFAULT_RUBRIC.requirementCategories,
    riskCategories: DEFAULT_RUBRIC.riskCategories,
    scoreWeights: DEFAULT_RUBRIC.scoreWeights,
    verdictThresholds: DEFAULT_RUBRIC.verdictThresholds,
    langfuseEnabled: true,
  };
}
