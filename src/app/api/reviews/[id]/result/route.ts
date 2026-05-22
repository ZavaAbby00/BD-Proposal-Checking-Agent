import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Returns the structured review report as a downloadable JSON file. */
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
  if (!review.result) {
    return NextResponse.json(
      { error: "This review has no result yet." },
      { status: 409 },
    );
  }

  return new NextResponse(JSON.stringify(review.result, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="review-${id}.json"`,
    },
  });
}
