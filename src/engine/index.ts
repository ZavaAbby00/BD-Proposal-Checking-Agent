/**
 * Public API of the proposal-review engine.
 *
 * The engine is framework-agnostic (no HTTP / Next.js imports) so both delivery
 * surfaces — the MCP server and the SaaS web app — consume it the same way.
 */
import { reviewGraph, AGENT_PIPELINE } from "@/engine/orchestrator";
import { createLangfuseHandler, finalizeLangfuse } from "@/engine/langfuse";
import type { ProposalReviewReport } from "@/engine/schema";
import type { ProgressEvent, ReviewInput } from "@/engine/types";

export type RunReviewOptions = {
  /** Called as each agent completes — used to stream progress to the UI. */
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Run the full multi-agent review. Streams the orchestrator so progress can be
 * reported per agent, traces the run in Langfuse, and returns the validated
 * structured report.
 */
export async function runReview(
  input: ReviewInput,
  opts: RunReviewOptions = {},
): Promise<ProposalReviewReport> {
  const handler = createLangfuseHandler(input.config.langfuse, {
    reviewId: input.reviewId,
    organizationId: input.config.organizationId,
  });
  const callbacks = handler ? [handler] : undefined;

  let report: ProposalReviewReport | undefined;

  const stream = await reviewGraph.stream(
    {
      proposal: input.proposal,
      rfp: input.rfp,
      config: input.config,
      reviewId: input.reviewId,
    },
    { callbacks, streamMode: "updates", recursionLimit: 50 },
  );

  for await (const chunk of stream) {
    for (const [agent, update] of Object.entries(chunk as Record<string, unknown>)) {
      opts.onProgress?.({ agent, status: "done", at: new Date().toISOString() });
      const u = update as { report?: ProposalReviewReport } | undefined;
      if (agent === "report-assembler" && u?.report) report = u.report;
    }
  }

  const { traceUrl } = await finalizeLangfuse(handler, input.config.langfuse?.host ?? "");
  if (!report) {
    throw new Error("The review pipeline did not produce a report.");
  }
  if (traceUrl) report.meta.langfuseTraceUrl = traceUrl;
  return report;
}

// Orchestrator + pipeline metadata.
export { reviewGraph, AGENT_PIPELINE };

// Schemas, types, rubric.
export * from "@/engine/schema";
export type {
  Chunk,
  DocKind,
  EngineConfig,
  EngineModelConfig,
  LangfuseConfig,
  ParsedDoc,
  ProgressEvent,
  ReviewInput,
} from "@/engine/types";
export { DEFAULT_RUBRIC, normalizeRubric } from "@/engine/rubric";
export type { Rubric, ScoreWeights, VerdictThresholds } from "@/engine/rubric";

// Document ingestion + the search tool.
export { parseDocument, renderChunks } from "@/lib/docparse";
export { searchProposal, gatherEvidence } from "@/engine/tools/search-proposal";

// Individual specialist agents — used by the MCP granular tools.
export { runRequirementAnalyst, type Requirement } from "@/engine/agents/requirement-analyst";
export { runSectionMapper } from "@/engine/agents/section-mapper";
export { runCompleteness } from "@/engine/agents/completeness";
export { runCompliance } from "@/engine/agents/compliance";
export { runRisk } from "@/engine/agents/risk";
export { runRecommendation } from "@/engine/agents/recommendation";
export { verifyCitations, type VerifiedFindings } from "@/engine/agents/citation-verifier";
export { scoreReadiness } from "@/engine/agents/scoring";
