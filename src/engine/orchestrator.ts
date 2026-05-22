import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import type {
  ComplianceOutput,
  CompletenessOutput,
  ReadinessScore,
  RecommendationsOutput,
  RiskOutput,
  SectionsOutput,
  ProposalReviewReport,
} from "@/engine/schema";
import type { EngineConfig, ParsedDoc } from "@/engine/types";
import { runIntake } from "@/engine/agents/intake";
import {
  runRequirementAnalyst,
  type Requirement,
} from "@/engine/agents/requirement-analyst";
import { runSectionMapper } from "@/engine/agents/section-mapper";
import { runCompleteness } from "@/engine/agents/completeness";
import { runCompliance } from "@/engine/agents/compliance";
import { runRisk } from "@/engine/agents/risk";
import { verifyCitations, type VerifiedFindings } from "@/engine/agents/citation-verifier";
import { scoreReadiness } from "@/engine/agents/scoring";
import { runRecommendation } from "@/engine/agents/recommendation";
import { assembleReport } from "@/engine/agents/assembler";

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    console.error(e.stack ?? e.message);
    return e.message;
  }
  console.error("[engine] non-Error thrown:", e);
  return typeof e === "string" ? e : JSON.stringify(e);
}

/** The shared state passed between agents — the orchestrator owns it. */
const ReviewStateAnnotation = Annotation.Root({
  // Inputs.
  proposal: Annotation<ParsedDoc>,
  rfp: Annotation<ParsedDoc | null>,
  config: Annotation<EngineConfig>,
  reviewId: Annotation<string>,
  // Intermediate agent outputs.
  requirements: Annotation<Requirement[]>,
  summary: Annotation<SectionsOutput["proposalSummary"]>,
  sections: Annotation<SectionsOutput["sections"]>,
  completenessRaw: Annotation<CompletenessOutput>,
  complianceRaw: Annotation<ComplianceOutput>,
  riskRaw: Annotation<RiskOutput>,
  verified: Annotation<VerifiedFindings>,
  score: Annotation<z.infer<typeof ReadinessScore>>,
  recommendations: Annotation<RecommendationsOutput["recommendations"]>,
  report: Annotation<ProposalReviewReport>,
  // Accumulated across agents — needs a reducer.
  warnings: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
});

type ReviewState = typeof ReviewStateAnnotation.State;
type Update = Partial<ReviewState>;

// ─────────────────────────── Agent nodes ───────────────────────────

async function intakeNode(state: ReviewState): Promise<Update> {
  const { warnings } = runIntake(state.proposal, state.rfp);
  return { warnings };
}

async function requirementAnalystNode(
  state: ReviewState,
  config?: RunnableConfig,
): Promise<Update> {
  if (!state.rfp) return { requirements: [] };
  try {
    const out = await runRequirementAnalyst(state.rfp, state.config, config);
    return { requirements: out.requirements };
  } catch (e) {
    return { requirements: [], warnings: [`Requirement Analyst agent failed: ${errMsg(e)}`] };
  }
}

async function sectionMapperNode(
  state: ReviewState,
  config?: RunnableConfig,
): Promise<Update> {
  try {
    const out = await runSectionMapper(state.proposal, state.config, config);
    return { sections: out.sections, summary: out.proposalSummary };
  } catch (e) {
    return {
      sections: [],
      summary: {
        client: null,
        engagement: "Could not be determined",
        overview: "The Section Mapper agent failed; the proposal could not be summarized.",
        proposedValue: null,
      },
      warnings: [`Section Mapper agent failed: ${errMsg(e)}`],
    };
  }
}

async function completenessNode(
  state: ReviewState,
  config?: RunnableConfig,
): Promise<Update> {
  try {
    const out = await runCompleteness(state.proposal, state.sections ?? [], state.config, config);
    return { completenessRaw: out };
  } catch (e) {
    return { completenessRaw: { items: [] }, warnings: [`Completeness agent failed: ${errMsg(e)}`] };
  }
}

async function complianceNode(
  state: ReviewState,
  config?: RunnableConfig,
): Promise<Update> {
  try {
    const out = await runCompliance(state.proposal, state.requirements ?? [], state.config, config);
    return { complianceRaw: out };
  } catch (e) {
    return { complianceRaw: { items: [] }, warnings: [`Compliance agent failed: ${errMsg(e)}`] };
  }
}

async function riskNode(state: ReviewState, config?: RunnableConfig): Promise<Update> {
  try {
    const out = await runRisk(state.proposal, state.sections ?? [], state.config, config);
    return { riskRaw: out };
  } catch (e) {
    return {
      riskRaw: {
        gaps: [],
        commercialRisks: [],
        valueProposition: { assessment: "weak", note: "Risk analysis failed to complete." },
      },
      warnings: [`Risk agent failed: ${errMsg(e)}`],
    };
  }
}

function verifyNode(state: ReviewState): Update {
  const verified = verifyCitations({
    proposal: state.proposal,
    rfp: state.rfp,
    rubric: state.config.rubric,
    requirements: state.requirements ?? [],
    sections: state.sections ?? [],
    completenessRaw: state.completenessRaw ?? { items: [] },
    complianceRaw: state.complianceRaw ?? { items: [] },
    riskRaw: state.riskRaw ?? {
      gaps: [],
      commercialRisks: [],
      valueProposition: { assessment: "weak", note: "No risk data." },
    },
  });
  return { verified, warnings: verified.warnings };
}

function scoreNode(state: ReviewState): Update {
  const v = state.verified;
  const score = scoreReadiness({
    rubric: state.config.rubric,
    rfpProvided: v.requirementMatch.length > 0,
    completeness: v.completeness,
    requirementMatch: v.requirementMatch,
    gaps: v.gaps,
    risks: v.risks,
  });
  return { score };
}

async function recommendationNode(
  state: ReviewState,
  config?: RunnableConfig,
): Promise<Update> {
  const v = state.verified;
  const issues = {
    missingMandatorySections: v.completeness
      .filter((c) => c.mandatory && c.status === "missing")
      .map((c) => c.section),
    weakSections: v.completeness
      .filter((c) => c.status === "partial" || c.quality === "weak")
      .map((c) => c.section),
    gaps: v.gaps.map((g) => ({
      id: g.id,
      type: g.type,
      severity: g.severity,
      description: g.description,
    })),
    risks: v.risks.map((r) => ({
      id: r.id,
      category: r.category,
      severity: r.severity,
      description: r.description,
    })),
    unmetRequirements: v.requirementMatch
      .filter((r) => r.status !== "covered")
      .map((r) => ({ id: r.requirementId, requirement: r.requirement, status: r.status })),
    valueProposition: `${v.valueProposition.assessment} — ${v.valueProposition.note}`,
  };
  try {
    const out = await runRecommendation(issues, state.config, config);
    return { recommendations: out.recommendations };
  } catch (e) {
    // Fallback: derive plain recommendations directly from the issues found.
    const fallback = [
      ...issues.gaps.map((g, i) => ({
        priority: g.severity === "critical" ? 1 : i + 2,
        action: `Address: ${g.description}`,
        rationale: "Derived from a detected gap (recommendation agent unavailable).",
        relatedTo: [g.id],
      })),
      ...issues.risks.map((r, i) => ({
        priority: r.severity === "critical" ? 1 : i + 5,
        action: `Mitigate ${r.category} risk: ${r.description}`,
        rationale: "Derived from a detected commercial risk (recommendation agent unavailable).",
        relatedTo: [r.id],
      })),
    ];
    return {
      recommendations: fallback,
      warnings: [`Recommendation agent failed: ${errMsg(e)} — used a deterministic fallback.`],
    };
  }
}

function assembleNode(state: ReviewState): Update {
  const v = state.verified;
  const report = assembleReport({
    reviewId: state.reviewId,
    organizationId: state.config.organizationId,
    proposalFile: state.proposal.filename,
    rfpFile: state.rfp?.filename ?? null,
    model: state.config.model.model,
    langfuseTraceUrl: null,
    warnings: state.warnings ?? [],
    rfpProvided: v.requirementMatch.length > 0,
    summary: state.summary,
    verified: v,
    recommendations: state.recommendations ?? [],
    score: state.score,
  });
  return { report };
}

// ─────────────────────────── Graph wiring ───────────────────────────

/**
 * The Orchestrator. Deterministic control flow over the specialist agents:
 *
 *   intake
 *     ├─▶ requirement-analyst ─▶ compliance ─┐
 *     └─▶ section-mapper ──┬──▶ completeness ─┤
 *                          └──▶ risk ─────────┤
 *                                             ▼
 *                                   citation-verifier
 *                                             ▼
 *                                          scoring
 *                                             ▼
 *                                       recommendation
 *                                             ▼
 *                                     report-assembler
 *
 * completeness ∥ compliance ∥ risk run concurrently (LangGraph fan-out);
 * citation-verifier joins them.
 */
function buildGraph() {
  return new StateGraph(ReviewStateAnnotation)
    .addNode("intake", intakeNode)
    .addNode("requirement-analyst", requirementAnalystNode)
    .addNode("section-mapper", sectionMapperNode)
    .addNode("completeness", completenessNode)
    .addNode("compliance", complianceNode)
    .addNode("risk", riskNode)
    .addNode("citation-verifier", verifyNode)
    .addNode("scoring", scoreNode)
    .addNode("recommendation", recommendationNode)
    .addNode("report-assembler", assembleNode)
    .addEdge(START, "intake")
    .addEdge("intake", "requirement-analyst")
    .addEdge("intake", "section-mapper")
    .addEdge("section-mapper", "completeness")
    .addEdge("requirement-analyst", "compliance")
    .addEdge("section-mapper", "risk")
    .addEdge("completeness", "citation-verifier")
    .addEdge("compliance", "citation-verifier")
    .addEdge("risk", "citation-verifier")
    .addEdge("citation-verifier", "scoring")
    .addEdge("scoring", "recommendation")
    .addEdge("recommendation", "report-assembler")
    .addEdge("report-assembler", END)
    .compile();
}

export const reviewGraph = buildGraph();

/** Ordered agent names — used by the UI to render the pipeline. */
export const AGENT_PIPELINE = [
  "intake",
  "requirement-analyst",
  "section-mapper",
  "completeness",
  "compliance",
  "risk",
  "citation-verifier",
  "scoring",
  "recommendation",
  "report-assembler",
] as const;
