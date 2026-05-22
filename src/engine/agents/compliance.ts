import type { RunnableConfig } from "@langchain/core/runnables";
import { ComplianceOutput } from "@/engine/schema";
import { runAgentLLM, systemPrompt } from "@/engine/llm";
import { renderChunks } from "@/lib/docparse";
import { searchProposal } from "@/engine/tools/search-proposal";
import type { EngineConfig, ParsedDoc } from "@/engine/types";
import type { Requirement } from "@/engine/agents/requirement-analyst";

const SYSTEM = `You are the Compliance agent in a proposal-review system.
For every RFP requirement you decide whether the proposal addresses it.

This is a tool-using agent: a search tool has already retrieved the chunks most
likely to be relevant to each requirement (the "retrieval hints"). Use the hints
to focus, but the full proposal is also provided — verify against it.

Rules:
- status: "covered" (fully addressed), "partial" (addressed but incomplete),
  "missing" (not addressed anywhere).
- Cite evidenceChunkIds (proposal chunk ids) for every covered/partial verdict.
- Never mark covered or partial without at least one evidence chunk id.
- Output one item per requirement id — do not skip any.`;

export async function runCompliance(
  proposal: ParsedDoc,
  requirements: Requirement[],
  config: EngineConfig,
  runnable?: RunnableConfig,
): Promise<ComplianceOutput> {
  if (requirements.length === 0) return { items: [] };

  // Tool use: retrieve likely evidence per requirement via search_proposal.
  const hints = requirements
    .map((r) => {
      const hits = searchProposal(proposal, r.text, 4)
        .map((h) => h.chunkId)
        .join(", ");
      return `${r.id}: ${hits || "(no lexical match — likely missing)"}`;
    })
    .join("\n");

  const requirementList = requirements
    .map(
      (r) =>
        `${r.id} [${r.category}${r.mandatory ? ", mandatory" : ""}]: ${r.text}`,
    )
    .join("\n");

  const user = `RFP REQUIREMENTS:
${requirementList}

RETRIEVAL HINTS (chunk ids the search tool flagged as likely-relevant per requirement):
${hints}

PROPOSAL DOCUMENT (each excerpt is prefixed with its chunk id):
${renderChunks(proposal)}

Classify every requirement id above.`;

  return runAgentLLM({
    cfg: config.model,
    agentName: "compliance",
    schema: ComplianceOutput,
    system: systemPrompt(config.model, "compliance", SYSTEM),
    user,
    config: runnable,
  });
}
