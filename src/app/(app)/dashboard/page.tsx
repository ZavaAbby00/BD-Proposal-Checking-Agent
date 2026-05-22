import Link from "next/link";
import { FilePlus2, FileSearch, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  reviewStatusDisplay,
  verdictDisplay,
  scoreColorClass,
} from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            You are signed in as a platform administrator without an
            organization. Use the{" "}
            <Link href="/platform" className="font-medium underline">
              Platform
            </Link>{" "}
            panel to manage organizations.
          </p>
        </Card>
      </div>
    );
  }

  const reviews = await prisma.review.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader />

      {reviews.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <FileSearch className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No reviews yet</p>
            <p className="text-sm text-muted-foreground">
              Upload a proposal draft and a client brief to run the first review.
            </p>
          </div>
          <Button asChild className="mt-1">
            <Link href="/reviews/new">
              <FilePlus2 />
              New review
            </Link>
          </Button>
        </Card>
      ) : (
        <Card className="divide-y">
          {reviews.map((review) => {
            const status = reviewStatusDisplay[review.status];
            const verdict = review.verdict ? verdictDisplay[review.verdict] : null;
            return (
              <Link
                key={review.id}
                href={`/reviews/${review.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {review.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatDate(review.createdAt)} ·{" "}
                    {review.createdBy?.name ?? review.createdBy?.email ?? "—"}
                  </div>
                </div>
                {review.status === "SUCCEEDED" &&
                review.readinessScore !== null ? (
                  <span
                    className={`text-sm font-semibold tabular-nums ${scoreColorClass(
                      review.readinessScore,
                    )}`}
                  >
                    {review.readinessScore}
                    <span className="text-xs text-muted-foreground">/100</span>
                  </span>
                ) : null}
                {verdict ? (
                  <Badge variant={verdict.variant}>{verdict.label}</Badge>
                ) : (
                  <Badge variant={status.variant}>{status.label}</Badge>
                )}
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Proposal checking results for your organization.
        </p>
      </div>
      <Button asChild>
        <Link href="/reviews/new">
          <FilePlus2 />
          New review
        </Link>
      </Button>
    </div>
  );
}
