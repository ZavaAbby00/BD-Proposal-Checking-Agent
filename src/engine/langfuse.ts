import { CallbackHandler } from "langfuse-langchain";
import type { LangfuseConfig } from "@/engine/types";

/**
 * Create a Langfuse callback handler for one review run. Returns null when
 * tracing is disabled or unconfigured — the engine then runs untraced.
 */
export function createLangfuseHandler(
  cfg: LangfuseConfig | undefined,
  meta: { reviewId: string; organizationId: string },
): CallbackHandler | null {
  if (!cfg || !cfg.enabled || !cfg.publicKey || !cfg.secretKey) return null;
  try {
    return new CallbackHandler({
      publicKey: cfg.publicKey,
      secretKey: cfg.secretKey,
      baseUrl: cfg.host,
      sessionId: meta.reviewId,
      userId: meta.organizationId,
      tags: ["proposal-review"],
    });
  } catch {
    return null;
  }
}

/** Best-effort extraction of the trace id/URL after a run, tolerant of SDK changes. */
export async function finalizeLangfuse(
  handler: CallbackHandler | null,
  host: string,
): Promise<{ traceId: string | null; traceUrl: string | null }> {
  if (!handler) return { traceId: null, traceUrl: null };
  let traceId: string | null = null;
  let traceUrl: string | null = null;
  try {
    const anyHandler = handler as unknown as {
      getTraceId?: () => string | undefined;
      getTraceUrl?: () => string | undefined;
      traceId?: string;
    };
    traceId = anyHandler.getTraceId?.() ?? anyHandler.traceId ?? null;
    traceUrl = anyHandler.getTraceUrl?.() ?? null;
    if (!traceUrl && traceId) {
      traceUrl = `${host.replace(/\/$/, "")}/trace/${traceId}`;
    }
  } catch {
    /* tracing metadata is best-effort */
  }
  try {
    await (handler as unknown as { flushAsync?: () => Promise<void> }).flushAsync?.();
  } catch {
    /* flush is best-effort */
  }
  return { traceId, traceUrl };
}
