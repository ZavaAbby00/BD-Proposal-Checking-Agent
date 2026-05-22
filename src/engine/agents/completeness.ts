import type { RunnableConfig } from "@langchain/core/runnables";
import { CompletenessOutput, type SectionsOutput } from "@/engine/schema";
import { runAgentLLM, systemPrompt } from "@/engine/llm";
import { renderChunks } from "@/lib/docparse";
import type { EngineConfig, ParsedDoc } from "@/engine/types";

const SYSTEM = `You are the Completeness agent in a proposal-review system.
You judge, for every section the rubric expects, whether the proposal includes
it and how good it is.

Rules:
- Output exactly one checklist item for EVERY mandatory and recommended section
  provided — never skip one. A skipped section is treated as a failure.
- status: "present" (fully there), "partial" (exists but thin/incomplete),
  "missing" (absent).
- quality: "strong" | "adequate" | "weak" when present/partial; null when missing.
- Cite evidenceChunkIds for every present/partial verdict. A "present" verdict
  with no citable evidence is invalid — use "missing" instead.
- Be strict. Pricing must be an actual cost breakdown, not a mention of "cost".`;

export async function runCompleteness(
  proposal: ParsedDoc,
  sections: SectionsOutput["sections"],
  config: EngineConfig,
  runnable?: RunnableConfig,
): Promise<CompletenessOutput> {
  const { mandatorySections, recommendedSections } = config.rubric;
  const structuralMap = sections
    .map((s) => `- ${s.canonicalName}: ${s.present ? "present" : "absent"} — ${s.summary}`)
    .join("\n");

  const user = `Rubric — MANDATORY sections: ${mandatorySections.join(", ")}
Rubric — RECOMMENDED sections: ${recommendedSections.join(", ")}

Structural section map produced by the Section Mapper agent:
${structuralMap || "(none)"}

PROPOSAL DOCUMENT (each excerpt is prefixed with its chunk id):
${renderChunks(proposal)}

Produce one checklist item for every mandatory and recommended section listed
above. Build on the structural map but apply your own strict judgment of
status and quality.`;

  return runAgentLLM({
    cfg: config.model,
    agentName: "completeness",
    schema: CompletenessOutput,
    system: systemPrompt(config.model, "completeness", SYSTEM),
    user,
    config: runnable,
  });
}
