import type { RunnableConfig } from "@langchain/core/runnables";
import { RiskOutput, type SectionsOutput } from "@/engine/schema";
import { runAgentLLM, systemPrompt } from "@/engine/llm";
import { renderChunks } from "@/lib/docparse";
import { gatherEvidence } from "@/engine/tools/search-proposal";
import type { EngineConfig, ParsedDoc } from "@/engine/types";

const SYSTEM = `You are the Risk agent in a proposal-review system.
You find what could make this proposal lose the deal or hurt the company if won.

This is a tool-using agent: a search tool has already retrieved commercially
sensitive excerpts (the "retrieval hints"). Use them to focus; the full proposal
is also provided.

You identify four things:
1. gaps — missing sections, unclear scope, weak value proposition, unmet needs,
   internal inconsistencies.
2. commercialRisks — pricing, payment terms, scope creep, timeline feasibility,
   legal/compliance, delivery capacity, unstated assumptions.
3. valueProposition — how compelling and differentiated the offer is.

Rules:
- Severity: low | medium | high | critical.
- A missing Pricing section or missing Assumptions/Exclusions is ALWAYS a
  critical commercial risk — a bid with no price is non-responsive.
- Cite evidenceChunkIds where the issue is visible; for a wholesale omission the
  list may be empty.
- Be specific and decision-useful, not generic.`;

const RISK_QUERIES = [
  "price cost fee budget total amount IDR USD",
  "payment invoice milestone instalment terms",
  "assumption exclusion out of scope dependency",
  "timeline schedule deadline duration delivery date",
  "penalty liability warranty indemnity termination",
  "service level SLA uptime availability response time",
];

export async function runRisk(
  proposal: ParsedDoc,
  sections: SectionsOutput["sections"],
  config: EngineConfig,
  runnable?: RunnableConfig,
): Promise<RiskOutput> {
  const queries = [...RISK_QUERIES, ...config.rubric.riskCategories];
  const evidence = gatherEvidence(proposal, queries, 3);
  const hints = evidence.map((c) => c.id).join(", ") || "(no commercially sensitive text matched)";

  const structuralMap = sections
    .map((s) => `- ${s.canonicalName}: ${s.present ? "present" : "ABSENT"}`)
    .join("\n");

  const user = `Risk categories to consider: ${config.rubric.riskCategories.join(", ")}

Structural section map (what the proposal contains):
${structuralMap || "(none)"}

RETRIEVAL HINTS (commercially sensitive chunk ids flagged by the search tool):
${hints}

PROPOSAL DOCUMENT (each excerpt is prefixed with its chunk id):
${renderChunks(proposal)}

Identify gaps, commercial risks, and assess the value proposition.`;

  return runAgentLLM({
    cfg: config.model,
    agentName: "risk",
    schema: RiskOutput,
    system: systemPrompt(config.model, "risk", SYSTEM),
    user,
    config: runnable,
  });
}
