import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDbUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { putObject, objectKey } from "@/lib/storage";
import { kickReview } from "@/lib/reviews";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|docx|txt|md)$/i;

type ResolvedDoc = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

/** Validate and read an uploaded document. The app only ever ingests files the
 *  user uploads — it requests no access to any external file storage. */
async function resolveUpload(file: File | null, label: string): Promise<ResolvedDoc> {
  if (!file || file.size === 0) {
    throw new Error(`No ${label} file was uploaded.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`The ${label} file exceeds the 20 MB limit.`);
  }
  if (!ALLOWED_EXT.test(file.name)) {
    throw new Error(`The ${label} must be a PDF, DOCX, TXT or MD file.`);
  }
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.organizationId) {
    return NextResponse.json(
      { error: "Your account is not attached to an organization." },
      { status: 403 },
    );
  }
  const organizationId = user.organizationId;

  try {
    const form = await req.formData();
    const rfpSource = String(form.get("rfpSource") ?? "none");
    const title = String(form.get("title") ?? "").trim();

    const proposal = await resolveUpload(
      form.get("proposalFile") as File | null,
      "proposal",
    );

    let rfp: ResolvedDoc | null = null;
    if (rfpSource === "upload") {
      rfp = await resolveUpload(form.get("rfpFile") as File | null, "client brief");
    }

    const batch = nanoid(10);
    const proposalKey = objectKey(organizationId, batch, `proposal-${proposal.filename}`);
    await putObject(proposalKey, proposal.buffer, proposal.mimeType);
    const proposalDoc = await prisma.document.create({
      data: {
        organizationId,
        type: "PROPOSAL",
        filename: proposal.filename,
        mimeType: proposal.mimeType,
        storageKey: proposalKey,
        source: "UPLOAD",
        uploadedById: user.id,
      },
    });

    let rfpDocId: string | undefined;
    if (rfp) {
      const rfpKey = objectKey(organizationId, batch, `rfp-${rfp.filename}`);
      await putObject(rfpKey, rfp.buffer, rfp.mimeType);
      const rfpDoc = await prisma.document.create({
        data: {
          organizationId,
          type: "RFP",
          filename: rfp.filename,
          mimeType: rfp.mimeType,
          storageKey: rfpKey,
          source: "UPLOAD",
          uploadedById: user.id,
        },
      });
      rfpDocId = rfpDoc.id;
    }

    const review = await prisma.review.create({
      data: {
        organizationId,
        createdById: user.id,
        proposalDocId: proposalDoc.id,
        rfpDocId,
        title: title || proposal.filename.replace(/\.[^.]+$/, ""),
        status: "QUEUED",
        surface: "WEB",
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "review.create",
      target: review.id,
      metadata: { title: review.title, hasRfp: Boolean(rfpDocId) },
    });

    kickReview(review.id);
    return NextResponse.json({ id: review.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create the review.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
