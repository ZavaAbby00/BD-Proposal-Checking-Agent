import { ChatVertexAI } from "@langchain/google-vertexai";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { z } from "zod";
import { env } from "@/lib/env";
import type { EngineModelConfig } from "@/engine/types";

/**
 * This engine authenticates to Vertex AI exclusively via Application Default
 * Credentials (a developer's gcloud ADC locally, the runtime service account on
 * Cloud Run). A stray GOOGLE_API_KEY / GOOGLE_GENAI_API_KEY in the environment
 * makes the Vertex SDK attempt API-key auth, which Vertex rejects with HTTP 401.
 * An empty GOOGLE_APPLICATION_CREDENTIALS likewise breaks ADC discovery.
 */
function scrubConflictingAuthEnv(): void {
  for (const key of ["GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"]) {
    if (process.env[key]) delete process.env[key];
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS === "") {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

/** Construct a Gemini chat model on Vertex AI. Auth uses Application Default Credentials. */
export function createChatModel(cfg: EngineModelConfig): ChatVertexAI {
  scrubConflictingAuthEnv();
  const project = env.gcpProject();
  return new ChatVertexAI({
    model: cfg.model,
    temperature: cfg.temperature,
    maxOutputTokens: cfg.maxOutputTokens,
    location: env.vertexLocation(),
    ...(project ? { authOptions: { projectId: project } } : {}),
  });
}

/**
 * Run one agent LLM call that must return data conforming to a Zod schema.
 * Uses Gemini structured output so the result is schema-valid by construction.
 * The RunnableConfig is forwarded so the call nests correctly under the
 * orchestrator's Langfuse trace.
 */
export async function runAgentLLM<T extends z.ZodTypeAny>(args: {
  cfg: EngineModelConfig;
  agentName: string;
  schema: T;
  system: string;
  user: string;
  config?: RunnableConfig;
}): Promise<z.infer<T>> {
  const model = createChatModel(args.cfg);
  const structured = model.withStructuredOutput(args.schema, { name: args.agentName });
  const result = await structured.invoke(
    [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    { ...args.config, runName: args.agentName },
  );
  return result as z.infer<T>;
}

/** Resolve the effective system prompt for an agent, honouring admin overrides. */
export function systemPrompt(
  cfg: EngineModelConfig,
  agentName: string,
  fallback: string,
): string {
  return cfg.promptOverrides?.[agentName]?.trim() || fallback;
}
