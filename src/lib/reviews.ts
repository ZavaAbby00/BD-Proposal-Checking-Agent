import type { Document } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { buildEngineConfig } from "@/lib/engine-config";
import { parseDocument } from "@/lib/docparse";
import { runReview } from "@/engine";
import { AGENT_PIPELINE } from "@/engine/orchestrator";
import { logAudit } from "@/lib/audit";
import type { DocKind } from "@/engine/types";

export const TOTAL_AGENTS = AGENT_PIPELINE.length;

export type ReviewProgress = {
  completed: string[];
  total: number;
};

function traceIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/trace\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function parseStoredDocument(doc: Document, kind: DocKind) {
  const buffer = await getObject(doc.storageKey);
  return parseDocument({ buffer, mimeType: doc.mimeType, filename: doc.filename, kind });
}

/**
 * Process one review end-to-end: parse the stored documents, run the
 * multi-agent engine, and persist the structured result. Runs as a background
 * job — never throws to the caller; failures are recorded on the review.
 */
export async function processReview(reviewId: string): Promise<void> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { proposalDoc: true, rfpDoc: true },
  });
  if (!review) return;

  try {
    await prisma.review.update({
      where: { id: reviewId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        progress: { completed: [], total: TOTAL_AGENTS } satisfies ReviewProgress,
      },
    });

    const proposal = await parseStoredDocument(review.proposalDoc, "proposal");
    const rfp = review.rfpDoc ? await parseStoredDocument(review.rfpDoc, "rfp") : null;

    await prisma.document.update({
      where: { id: review.proposalDocId },
      data: { pageCount: proposal.pageCount, textChars: proposal.fullText.length },
    });
    if (rfp && review.rfpDocId) {
      await prisma.document.update({
        where: { id: review.rfpDocId },
        data: { pageCount: rfp.pageCount, textChars: rfp.fullText.length },
      });
    }

    const config = await buildEngineConfig(review.organizationId);
    const completed: string[] = [];

    const report = await runReview(
      { proposal, rfp, reviewId, config },
      {
        onProgress: (event) => {
          completed.push(event.agent);
          void prisma.review
            .update({
              where: { id: reviewId },
              data: {
                progress: {
                  completed: [...completed],
                  total: TOTAL_AGENTS,
                } satisfies ReviewProgress,
              },
            })
            .catch(() => undefined);
        },
      },
    );

    await prisma.review.update({
      where: { id: reviewId },
      data: {
        status: "SUCCEEDED",
        result: report as unknown as object,
        readinessScore: report.readinessScore.score,
        verdict: report.readinessScore.verdict,
        langfuseTraceId: traceIdFromUrl(report.meta.langfuseTraceUrl),
        completedAt: new Date(),
        progress: { completed, total: TOTAL_AGENTS } satisfies ReviewProgress,
      },
    });

    await logAudit({
      organizationId: review.organizationId,
      actorId: review.createdById,
      action: "review.completed",
      target: reviewId,
      metadata: {
        verdict: report.readinessScore.verdict,
        score: report.readinessScore.score,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[reviews] processReview(${reviewId}) failed:`, e);
    await prisma.review
      .update({
        where: { id: reviewId },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      })
      .catch(() => undefined);
  }
}

/**
 * Start processing a review in the background and return immediately. The
 * Cloud Run service is configured with CPU always allocated so the work
 * completes after the HTTP response is sent.
 */
export function kickReview(reviewId: string): void {
  void processReview(reviewId).catch((e) =>
    console.error(`[reviews] background processing failed for ${reviewId}:`, e),
  );
}
