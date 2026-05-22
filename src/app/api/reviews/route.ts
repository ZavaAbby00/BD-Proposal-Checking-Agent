import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDbUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { putObject, objectKey } from "@/lib/storage";
import { kickReview } from "@/lib/reviews";
import { parseGoogleDocId, exportGoogleDoc } from "@/lib/docparse";
import { getGoogleAccessToken } from "@/lib/google";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|docx|txt|md)$/i;

type ResolvedDoc = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  isGdoc: boolean;
};

async function resolveDoc(opts: {
  source: string;
  file: File | null;
  gdocUrl: string | null;
  userId: string;
  label: string;
}): Promise<ResolvedDoc> {
  if (opts.source === "gdoc") {
    const docId = parseGoogleDocId(opts.gdocUrl ?? "");
    if (!docId) throw new Error(`Invalid Google Docs link for the ${opts.label}.`);
    const token = await getGoogleAccessToken(opts.userId);
    const exported = await exportGoogleDoc(docId, token);
    return {
      buffer: Buffer.from(exported.text, "utf-8"),
      filename: exported.filename,
      mimeType: "text/plain",
      isGdoc: true,
    };
  }

  if (!opts.file || opts.file.size === 0) {
    throw new Error(`No ${opts.label} file was uploaded.`);
  }
  if (opts.file.size > MAX_FILE_BYTES) {
    throw new Error(`The ${opts.label} file exceeds the 20 MB limit.`);
  }
  if (!ALLOWED_EXT.test(opts.file.name)) {
    throw new Error(`The ${opts.label} must be a PDF, DOCX, TXT or MD file.`);
  }
  return {
    buffer: Buffer.from(await opts.file.arrayBuffer()),
    filename: opts.file.name,
    mimeType: opts.file.type || "application/octet-stream",
    isGdoc: false,
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
    const proposalSource = String(form.get("proposalSource") ?? "upload");
    const rfpSource = String(form.get("rfpSource") ?? "none");
    const title = String(form.get("title") ?? "").trim();

    const proposal = await resolveDoc({
      source: proposalSource,
      file: form.get("proposalFile") as File | null,
      gdocUrl: form.get("proposalGdocUrl") as string | null,
      userId: user.id,
      label: "proposal",
    });

    let rfp: ResolvedDoc | null = null;
    if (rfpSource !== "none") {
      rfp = await resolveDoc({
        source: rfpSource,
        file: form.get("rfpFile") as File | null,
        gdocUrl: form.get("rfpGdocUrl") as string | null,
        userId: user.id,
        label: "client brief",
      });
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
        source: proposal.isGdoc ? "GDRIVE" : "UPLOAD",
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
          source: rfp.isGdoc ? "GDRIVE" : "UPLOAD",
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
