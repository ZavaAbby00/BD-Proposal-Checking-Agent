import type { RunnableConfig } from "@langchain/core/runnables";
import { RecommendationsOutput } from "@/engine/schema";
import { runAgentLLM, systemPrompt } from "@/engine/llm";
import type { EngineConfig } from "@/engine/types";

const SYSTEM = `You are the Recommendation agent in a proposal-review system.
Given the gaps, commercial risks and unmet requirements found by the other
agents, you write prioritized, concrete improvement actions for the BD writer.

Rules:
- priority 1 = must fix before submission (blocking); higher numbers = less urgent.
- Each action is specific and immediately actionable — name what to add or change.
- relatedTo lists the gap/risk/requirement ids the action resolves.
- Do not invent issues; only address what was provided. Order by priority.`;

export type RecommendationIssues = {
  missingMandatorySections: string[];
  weakSections: string[];
  gaps: { id: string; type: string; severity: string; description: string }[];
  risks: { id: string; category: string; severity: string; description: string }[];
  unmetRequirements: { id: string; requirement: string; status: string }[];
  valueProposition: string;
};

export async function runRecommendation(
  issues: RecommendationIssues,
  config: EngineConfig,
  runnable?: RunnableConfig,
): Promise<RecommendationsOutput> {
  const fmt = (lines: string[]) => (lines.length ? lines.join("\n") : "(none)");

  const user = `ISSUES FOUND IN THE PROPOSAL

Missing mandatory sections:
${fmt(issues.missingMandatorySections.map((s) => `- ${s}`))}

Weak / partial sections:
${fmt(issues.weakSections.map((s) => `- ${s}`))}

Gaps:
${fmt(issues.gaps.map((g) => `- ${g.id} [${g.severity}/${g.type}]: ${g.description}`))}

Commercial risks:
${fmt(issues.risks.map((r) => `- ${r.id} [${r.severity}/${r.category}]: ${r.description}`))}

Unmet / partially-met RFP requirements:
${fmt(issues.unmetRequirements.map((r) => `- ${r.id} (${r.status}): ${r.requirement}`))}

Value proposition assessment: ${issues.valueProposition}

Write prioritized recommendations that resolve these issues.`;

  return runAgentLLM({
    cfg: config.model,
    agentName: "recommendation",
    schema: RecommendationsOutput,
    system: systemPrompt(config.model, "recommendation", SYSTEM),
    user,
    config: runnable,
  });
}
