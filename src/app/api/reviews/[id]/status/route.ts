import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Lightweight status endpoint polled by the review-progress UI. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const review = await prisma.review.findUnique({ where: { id } });
  if (
    !review ||
    (review.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN")
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: review.status,
    progress: review.progress ?? { completed: [], total: 10 },
    verdict: review.verdict,
    readinessScore: review.readinessScore,
    error: review.error,
  });
}
