import type { Rubric } from "@/engine/rubric";

/** A document being reviewed. */
export type DocKind = "proposal" | "rfp";

/**
 * A unit of source text with a stable id used as the citation anchor.
 * id format: `P{page}-{idx}` for proposal, `R{page}-{idx}` for RFP.
 */
export type Chunk = {
  id: string;
  page: number;
  text: string;
};

export type ParsedDoc = {
  kind: DocKind;
  filename: string;
  mimeType: string;
  pageCount: number;
  chunks: Chunk[];
  fullText: string;
};

export type EngineModelConfig = {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  /** Optional per-agent system-prompt overrides, keyed by agent name. */
  promptOverrides?: Record<string, string>;
};

export type LangfuseConfig = {
  enabled: boolean;
  publicKey: string;
  secretKey: string;
  host: string;
};

export type EngineConfig = {
  organizationId: string;
  rubric: Rubric;
  model: EngineModelConfig;
  langfuse?: LangfuseConfig;
};

export type ReviewInput = {
  proposal: ParsedDoc;
  rfp: ParsedDoc | null;
  config: EngineConfig;
  /** Stable id used to correlate the Langfuse trace with the stored review. */
  reviewId: string;
};

/** Progress event emitted as the orchestrator advances through agents. */
export type ProgressEvent = {
  agent: string;
  status: "running" | "done" | "error";
  at: string;
};
