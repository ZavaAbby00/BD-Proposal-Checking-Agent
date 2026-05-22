/**
 * The review rubric — the configurable definition of what a "complete" and
 * "ready" proposal looks like. Stored per-organization in OrgSettings and
 * editable from the org admin panel. The mandatory-sections list drives both
 * the Completeness agent and the Scoring agent's hard cap.
 */

export type ScoreWeights = {
  completeness: number;
  coverage: number;
  risk: number;
};

export type VerdictThresholds = {
  ready: number;
  needsRevision: number;
};

export type Rubric = {
  mandatorySections: string[];
  recommendedSections: string[];
  requirementCategories: string[];
  riskCategories: string[];
  scoreWeights: ScoreWeights;
  verdictThresholds: VerdictThresholds;
};

export const DEFAULT_RUBRIC: Rubric = {
  mandatorySections: [
    "Executive Summary",
    "Scope of Work",
    "Methodology / Approach",
    "Timeline / Schedule",
    "Pricing / Cost Breakdown",
    "Assumptions & Exclusions",
    "Team & Qualifications",
  ],
  recommendedSections: [
    "Company Profile",
    "Case Studies / References",
    "Service Levels (SLA)",
    "Terms & Conditions",
    "Risk Management",
    "Value Proposition / Differentiators",
  ],
  requirementCategories: [
    "Functional",
    "Technical",
    "Commercial",
    "Compliance / Legal",
    "Delivery / Timeline",
    "Support / Maintenance",
  ],
  riskCategories: [
    "pricing",
    "scope_creep",
    "timeline",
    "payment_terms",
    "legal_compliance",
    "delivery_capacity",
    "assumptions",
  ],
  scoreWeights: {
    completeness: 0.45,
    coverage: 0.4,
    risk: 0.15,
  },
  verdictThresholds: {
    ready: 80,
    needsRevision: 55,
  },
};

/** Coerce a possibly-partial stored rubric (JSON columns) into a complete Rubric. */
export function normalizeRubric(input: Partial<Rubric> | null | undefined): Rubric {
  return {
    mandatorySections: input?.mandatorySections?.length
      ? input.mandatorySections
      : DEFAULT_RUBRIC.mandatorySections,
    recommendedSections: input?.recommendedSections?.length
      ? input.recommendedSections
      : DEFAULT_RUBRIC.recommendedSections,
    requirementCategories: input?.requirementCategories?.length
      ? input.requirementCategories
      : DEFAULT_RUBRIC.requirementCategories,
    riskCategories: input?.riskCategories?.length
      ? input.riskCategories
      : DEFAULT_RUBRIC.riskCategories,
    scoreWeights: input?.scoreWeights ?? DEFAULT_RUBRIC.scoreWeights,
    verdictThresholds: input?.verdictThresholds ?? DEFAULT_RUBRIC.verdictThresholds,
  };
}
