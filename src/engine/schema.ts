import { z } from "zod";

/**
 * Zod schemas for (a) the structured output each LLM agent must return and
 * (b) the final review report.
 *
 * IMPORTANT: schemas passed to Gemini structured output must not share a Zod
 * object instance across two fields — the JSON-schema converter would emit a
 * `$ref`, which Gemini's function-calling schema rejects. Agent schemas below
 * therefore build every enum inline (fresh `z.enum(...)` per field). The report
 * schema is only validated locally, so it may reuse the shared enums.
 */

// ─────────────────────── Enum value tuples ───────────────────────

export const SEVERITY = ["low", "medium", "high", "critical"] as const;
export const SECTION_STATUS = ["present", "partial", "missing"] as const;
export const QUALITY = ["strong", "adequate", "weak"] as const;
export const MATCH_STATUS = ["covered", "partial", "missing"] as const;
export const VERDICT = ["READY", "NEEDS_REVISION", "NOT_READY"] as const;
export const GAP_TYPE = [
  "missing_section",
  "unclear_scope",
  "weak_value_prop",
  "unmet_requirement",
  "inconsistency",
  "other",
] as const;

// Shared enums — used by the final report schema and for TS types.
export const Severity = z.enum(SEVERITY);
export const SectionStatus = z.enum(SECTION_STATUS);
export const Quality = z.enum(QUALITY);
export const MatchStatus = z.enum(MATCH_STATUS);
export const Verdict = z.enum(VERDICT);
export const GapType = z.enum(GAP_TYPE);

export type SeverityValue = (typeof SEVERITY)[number];

// ─────────────────────── Agent output schemas ───────────────────────
// Every enum is built inline so no Zod instance is shared (avoids `$ref`).

/** Requirement Analyst — extracts discrete requirements from the RFP/TOR. */
export const RequirementsOutput = z.object({
  requirements: z.array(
    z.object({
      id: z.string().describe("Stable id like R1, R2, R3"),
      text: z.string().describe("The requirement, stated concisely"),
      category: z.string().describe("One of the configured requirement categories"),
      mandatory: z.boolean().describe("True if the RFP marks this as mandatory/must-have"),
      sourceChunkIds: z.array(z.string()).describe("RFP chunk ids this was drawn from"),
    }),
  ),
});
export type RequirementsOutput = z.infer<typeof RequirementsOutput>;

/** Section Mapper — maps proposal content onto the canonical section taxonomy. */
export const SectionsOutput = z.object({
  proposalSummary: z.object({
    client: z.string().nullable().describe("Client / prospect name, or null if not stated"),
    engagement: z.string().describe("One line: what is being proposed"),
    overview: z.string().describe("2-4 sentence neutral overview of the proposal"),
    proposedValue: z.string().nullable().describe("Stated price / contract value, or null"),
  }),
  sections: z.array(
    z.object({
      canonicalName: z.string().describe("A section name from the rubric taxonomy"),
      present: z.boolean(),
      evidenceChunkIds: z.array(z.string()),
      summary: z.string().describe("What this section contains, or why it is considered absent"),
    }),
  ),
});
export type SectionsOutput = z.infer<typeof SectionsOutput>;

/** Completeness agent — section presence and substance vs. the rubric. */
export const CompletenessOutput = z.object({
  items: z.array(
    z.object({
      section: z.string(),
      status: z.enum(SECTION_STATUS),
      quality: z.enum(QUALITY).nullable().describe("null when the section is missing"),
      note: z.string(),
      evidenceChunkIds: z.array(z.string()),
    }),
  ),
});
export type CompletenessOutput = z.infer<typeof CompletenessOutput>;

/** Compliance agent — requirement-by-requirement matching against the proposal. */
export const ComplianceOutput = z.object({
  items: z.array(
    z.object({
      requirementId: z.string(),
      status: z.enum(MATCH_STATUS),
      note: z.string(),
      evidenceChunkIds: z.array(z.string()),
    }),
  ),
});
export type ComplianceOutput = z.infer<typeof ComplianceOutput>;

/** Risk agent — gaps, unclear scope, weak value proposition, commercial risks. */
export const RiskOutput = z.object({
  gaps: z.array(
    z.object({
      type: z.enum(GAP_TYPE),
      severity: z.enum(SEVERITY),
      description: z.string(),
      evidenceChunkIds: z.array(z.string()),
    }),
  ),
  commercialRisks: z.array(
    z.object({
      category: z.string(),
      severity: z.enum(SEVERITY),
      description: z.string(),
      evidenceChunkIds: z.array(z.string()),
    }),
  ),
  valueProposition: z.object({
    assessment: z.enum(QUALITY),
    note: z.string(),
  }),
});
export type RiskOutput = z.infer<typeof RiskOutput>;

/** Recommendation agent — prioritized improvement actions. */
export const RecommendationsOutput = z.object({
  recommendations: z.array(
    z.object({
      priority: z.number().int().describe("1 = highest priority"),
      action: z.string().describe("A concrete, actionable improvement"),
      rationale: z.string(),
      relatedTo: z.array(z.string()).describe("Gap/risk ids this addresses"),
    }),
  ),
});
export type RecommendationsOutput = z.infer<typeof RecommendationsOutput>;

// ─────────────────────── Final report schema ───────────────────────

export const Citation = z.object({
  id: z.string().describe("Display id: C1, C2, ..."),
  docKind: z.enum(["proposal", "rfp"]),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  quote: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const CompletenessItem = z.object({
  section: z.string(),
  mandatory: z.boolean(),
  status: SectionStatus,
  quality: Quality.nullable(),
  note: z.string(),
  citationIds: z.array(z.string()),
});

export const RequirementMatchItem = z.object({
  requirementId: z.string(),
  requirement: z.string(),
  category: z.string(),
  mandatory: z.boolean(),
  status: MatchStatus,
  note: z.string(),
  citationIds: z.array(z.string()),
});

export const Gap = z.object({
  id: z.string(),
  type: GapType,
  severity: Severity,
  description: z.string(),
  citationIds: z.array(z.string()),
});

export const CommercialRisk = z.object({
  id: z.string(),
  category: z.string(),
  severity: Severity,
  description: z.string(),
  citationIds: z.array(z.string()),
});

export const Recommendation = z.object({
  priority: z.number().int(),
  action: z.string(),
  rationale: z.string(),
  relatedTo: z.array(z.string()),
});

export const ReadinessScore = z.object({
  score: z.number().int().min(0).max(100),
  verdict: Verdict,
  subScores: z.object({
    completeness: z.number(),
    requirementCoverage: z.number(),
    riskPenalty: z.number(),
  }),
  rationale: z.string(),
  blockingIssues: z.array(z.string()),
});

export const ProposalReviewReport = z.object({
  schemaVersion: z.literal("1.0"),
  meta: z.object({
    reviewId: z.string(),
    organizationId: z.string(),
    proposalFile: z.string(),
    rfpFile: z.string().nullable(),
    model: z.string(),
    reviewedAt: z.string(),
    langfuseTraceUrl: z.string().nullable(),
    warnings: z.array(z.string()),
  }),
  proposalSummary: z.object({
    client: z.string().nullable(),
    engagement: z.string(),
    overview: z.string(),
    proposedValue: z.string().nullable(),
  }),
  completenessChecklist: z.array(CompletenessItem),
  requirementMatch: z.object({
    rfpProvided: z.boolean(),
    summary: z.object({
      total: z.number().int(),
      covered: z.number().int(),
      partial: z.number().int(),
      missing: z.number().int(),
    }),
    items: z.array(RequirementMatchItem),
  }),
  keyGaps: z.array(Gap),
  commercialRisks: z.array(CommercialRisk),
  valueProposition: z.object({
    assessment: Quality,
    note: z.string(),
  }),
  recommendations: z.array(Recommendation),
  readinessScore: ReadinessScore,
  citations: z.array(Citation),
});
export type ProposalReviewReport = z.infer<typeof ProposalReviewReport>;
