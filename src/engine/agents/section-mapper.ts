import type { RunnableConfig } from "@langchain/core/runnables";
import { SectionsOutput } from "@/engine/schema";
import { runAgentLLM, systemPrompt } from "@/engine/llm";
import { renderChunks } from "@/lib/docparse";
import type { EngineConfig, ParsedDoc } from "@/engine/types";

const SYSTEM = `You are the Section Mapper agent in a proposal-review system.
You map a proposal's content onto a canonical section taxonomy and produce a
neutral summary of the proposal.

Rules:
- A section counts as "present" only if the proposal substantively contains it,
  even if titled differently — judge by content, not headings.
- A passing one-line mention is NOT a present section.
- Cite evidenceChunkIds (proposal chunk ids) for every section you mark present.
- The summary must be neutral and factual — never marketing language.
- Output one entry for every canonical section provided, in order.`;

export async function runSectionMapper(
  proposal: ParsedDoc,
  config: EngineConfig,
  runnable?: RunnableConfig,
): Promise<SectionsOutput> {
  const { mandatorySections, recommendedSections } = config.rubric;
  const user = `Canonical sections — MANDATORY: ${mandatorySections.join(", ")}
Canonical sections — RECOMMENDED: ${recommendedSections.join(", ")}

PROPOSAL DOCUMENT (each excerpt is prefixed with its chunk id):
${renderChunks(proposal)}

For every canonical section above, decide present true/false with evidenceChunkIds.
Then produce proposalSummary: client name (or null), a one-line engagement
description, a 2-4 sentence neutral overview, and proposedValue (the stated
price / contract value, or null if none is stated).`;

  return runAgentLLM({
    cfg: config.model,
    agentName: "section-mapper",
    schema: SectionsOutput,
    system: systemPrompt(config.model, "section-mapper", SYSTEM),
    user,
    config: runnable,
  });
}
