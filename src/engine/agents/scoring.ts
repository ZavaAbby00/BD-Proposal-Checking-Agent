import { z } from "zod";
import {
  CommercialRisk,
  CompletenessItem,
  Gap,
  ReadinessScore,
  RequirementMatchItem,
} from "@/engine/schema";
import type { Rubric } from "@/engine/rubric";
import { clamp, round, SEVERITY_WEIGHT } from "@/engine/util";

type TReadinessScore = z.infer<typeof ReadinessScore>;
type TCompletenessItem = z.infer<typeof CompletenessItem>;
type TRequirementMatchItem = z.infer<typeof RequirementMatchItem>;
type TGap = z.infer<typeof Gap>;
type TCommercialRisk = z.infer<typeof CommercialRisk>;

export type ScoreInput = {
  rubric: Rubric;
  rfpProvided: boolean;
  completeness: TCompletenessItem[];
  requirementMatch: TRequirementMatchItem[];
  gaps: TGap[];
  risks: TCommercialRisk[];
};

function statusValue(status: string): number {
  if (status === "present" || status === "covered") return 1;
  if (status === "partial") return 0.5;
  return 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 1;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Scoring agent (deterministic + rubric). Produces the readiness score and
 * verdict. The verdict is NOT decided by an LLM — two hard rules apply:
 *
 *   1. Any missing mandatory section ⇒ a deterministic critical gap exists
 *      (added by the Citation Verifier) ⇒ verdict capped at NOT_READY.
 *   2. Any critical-severity gap or risk ⇒ verdict capped at NOT_READY.
 *
 * This makes a false "READY" structurally impossible when something
 * commercially essential (e.g. pricing, assumptions) is absent.
 */
export function scoreReadiness(input: ScoreInput): TReadinessScore {
  const mandatory = input.completeness.filter((c) => c.mandatory);
  const recommended = input.completeness.filter((c) => !c.mandatory);

  const mandatoryScore = average(mandatory.map((c) => statusValue(c.status)));
  const recommendedScore = average(recommended.map((c) => statusValue(c.status)));
  const completenessScore = 100 * (0.8 * mandatoryScore + 0.2 * recommendedScore);

  const coverageScore = input.rfpProvided
    ? 100 * average(input.requirementMatch.map((r) => statusValue(r.status)))
    : 0;

  const allIssues = [...input.gaps, ...input.risks];
  const riskPenalty = Math.min(
    100,
    allIssues.reduce((sum, issue) => sum + (SEVERITY_WEIGHT[issue.severity] ?? 0), 0),
  );

  // Weighted blend; if no RFP, the coverage weight folds into completeness.
  const w = input.rubric.scoreWeights;
  let wc = w.completeness;
  let wv = w.coverage;
  const wr = w.risk;
  if (!input.rfpProvided) {
    wc += wv;
    wv = 0;
  }
  const wSum = wc + wv + wr || 1;
  const score = clamp(
    Math.round(
      ((wc * completenessScore + wv * coverageScore + wr * (100 - riskPenalty)) / wSum),
    ),
    0,
    100,
  );

  // Hard rules.
  const criticalIssues = allIssues.filter((x) => x.severity === "critical");
  const blockingIssues = criticalIssues.map((x) => x.id);
  const missingMandatory = mandatory
    .filter((c) => c.status === "missing")
    .map((c) => c.section);

  const { ready, needsRevision } = input.rubric.verdictThresholds;
  let verdict: z.infer<typeof ReadinessScore>["verdict"];
  let rationale: string;

  if (blockingIssues.length > 0) {
    verdict = "NOT_READY";
    const reasons: string[] = [];
    if (missingMandatory.length > 0) {
      reasons.push(`mandatory section(s) missing: ${missingMandatory.join(", ")}`);
    }
    const otherCritical = criticalIssues.length - missingMandatory.length;
    if (otherCritical > 0) reasons.push(`${otherCritical} other critical issue(s)`);
    rationale = `Verdict hard-capped at NOT_READY — ${reasons.join("; ")}. A score of ${score}/100 cannot raise the verdict while blocking issues remain.`;
  } else if (score >= ready) {
    verdict = "READY";
    rationale = `Score ${score}/100 meets the READY threshold (${ready}) with no blocking issues.`;
  } else if (score >= needsRevision) {
    verdict = "NEEDS_REVISION";
    rationale = `Score ${score}/100 is between the revision (${needsRevision}) and ready (${ready}) thresholds — addressable issues remain.`;
  } else {
    verdict = "NOT_READY";
    rationale = `Score ${score}/100 is below the revision threshold (${needsRevision}).`;
  }

  return {
    score,
    verdict,
    subScores: {
      completeness: round(completenessScore, 1),
      requirementCoverage: input.rfpProvided ? round(coverageScore, 1) : 0,
      riskPenalty: round(riskPenalty, 1),
    },
    rationale,
    blockingIssues,
  };
}
