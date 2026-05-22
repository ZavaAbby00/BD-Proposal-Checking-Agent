import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ReportView } from "@/components/reviews/report-view";
import { ReviewProgress } from "@/components/reviews/review-progress";
import { Card } from "@/components/ui/card";
import type { ProposalReviewReport } from "@/engine/schema";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      proposalDoc: true,
      rfpDoc: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (
    !review ||
    (review.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN")
  ) {
    notFound();
  }

  const progress = review.progress as { completed?: string[] } | null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Reviews
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{review.title}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          {review.proposalDoc.filename}
          {review.rfpDoc && <span>· brief: {review.rfpDoc.filename}</span>}
        </p>
      </div>

      {review.status === "SUCCEEDED" && review.result ? (
        <ReportView
          report={review.result as unknown as ProposalReviewReport}
          reviewId={review.id}
        />
      ) : review.status === "FAILED" ? (
        <Card className="border-destructive/30 bg-destructive/5 p-6">
          <h2 className="font-medium text-destructive">Review failed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {review.error ?? "An unknown error occurred while processing this review."}
          </p>
        </Card>
      ) : (
        <ReviewProgress
          reviewId={review.id}
          initialCompleted={progress?.completed ?? []}
        />
      )}
    </div>
  );
}
