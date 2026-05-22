import { z } from "zod";
import {
  ProposalReviewReport,
  ReadinessScore,
  type RecommendationsOutput,
  type SectionsOutput,
} from "@/engine/schema";
import type { VerifiedFindings } from "@/engine/agents/citation-verifier";

export type AssembleInput = {
  reviewId: string;
  organizationId: string;
  proposalFile: string;
  rfpFile: string | null;
  model: string;
  langfuseTraceUrl: string | null;
  warnings: string[];
  rfpProvided: boolean;
  summary: SectionsOutput["proposalSummary"];
  verified: VerifiedFindings;
  recommendations: RecommendationsOutput["recommendations"];
  score: z.infer<typeof ReadinessScore>;
};

/**
 * Report Assembler (deterministic). Combines every agent's output into the
 * canonical report and validates it against the Zod schema — the engine never
 * returns a structurally invalid result.
 */
export function assembleReport(input: AssembleInput): ProposalReviewReport {
  const items = input.verified.requirementMatch;
  const summary = {
    total: items.length,
    covered: items.filter((i) => i.status === "covered").length,
    partial: items.filter((i) => i.status === "partial").length,
    missing: items.filter((i) => i.status === "missing").length,
  };

  const report = {
    schemaVersion: "1.0" as const,
    meta: {
      reviewId: input.reviewId,
      organizationId: input.organizationId,
      proposalFile: input.proposalFile,
      rfpFile: input.rfpFile,
      model: input.model,
      reviewedAt: new Date().toISOString(),
      langfuseTraceUrl: input.langfuseTraceUrl,
      warnings: input.warnings,
    },
    proposalSummary: input.summary,
    completenessChecklist: input.verified.completeness,
    requirementMatch: {
      rfpProvided: input.rfpProvided,
      summary,
      items,
    },
    keyGaps: input.verified.gaps,
    commercialRisks: input.verified.risks,
    valueProposition: input.verified.valueProposition,
    recommendations: [...input.recommendations].sort((a, b) => a.priority - b.priority),
    readinessScore: input.score,
    citations: input.verified.citations,
  };

  // Throws if any agent produced something off-contract — fail loud, not silent.
  return ProposalReviewReport.parse(report);
}
