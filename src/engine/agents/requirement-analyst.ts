import type { RunnableConfig } from "@langchain/core/runnables";
import { RequirementsOutput } from "@/engine/schema";
import { runAgentLLM, systemPrompt } from "@/engine/llm";
import { renderChunks } from "@/lib/docparse";
import type { EngineConfig, ParsedDoc } from "@/engine/types";

export type Requirement = RequirementsOutput["requirements"][number];

const SYSTEM = `You are the Requirement Analyst agent in a proposal-review system.
You read a client RFP / Terms of Reference (TOR) and extract every discrete,
individually checkable requirement — each one a single obligation a proposal
can be tested against.

Rules:
- One requirement = one testable obligation. Split compound sentences.
- Do not invent requirements that are not in the document.
- Classify each into exactly one of the provided categories.
- mandatory = true when the language is obligatory (must, shall, required, mandatory).
- Set sourceChunkIds to the RFP chunk ids each requirement is drawn from.
- Be exhaustive: missing a requirement causes a blind spot downstream.`;

export async function runRequirementAnalyst(
  rfp: ParsedDoc,
  config: EngineConfig,
  runnable?: RunnableConfig,
): Promise<RequirementsOutput> {
  const user = `Requirement categories to use: ${config.rubric.requirementCategories.join(", ")}

RFP / TOR DOCUMENT (each excerpt is prefixed with its chunk id):
${renderChunks(rfp)}

Extract every discrete requirement. Assign sequential ids R1, R2, R3, …`;

  return runAgentLLM({
    cfg: config.model,
    agentName: "requirement-analyst",
    schema: RequirementsOutput,
    system: systemPrompt(config.model, "requirement-analyst", SYSTEM),
    user,
    config: runnable,
  });
}
