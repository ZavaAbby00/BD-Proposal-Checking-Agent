import type { DocKind, ParsedDoc } from "@/engine/types";
import { chunkPage, paginate } from "@/lib/docparse/chunk";
import { parsePdf } from "@/lib/docparse/pdf";
import { parseDocx } from "@/lib/docparse/docx";

export { parseGoogleDocId, exportGoogleDoc } from "@/lib/docparse/gdocs";

export type ParseInput = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  kind: DocKind;
};

function detectFormat(mimeType: string, filename: string): "pdf" | "docx" | "text" {
  const name = filename.toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  return "text";
}

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

/**
 * Parse a proposal or RFP into a normalized, citation-anchored document.
 * Supports PDF, DOCX, and plain text (the latter also covers exported Google Docs).
 */
export async function parseDocument(input: ParseInput): Promise<ParsedDoc> {
  const prefix: "P" | "R" = input.kind === "proposal" ? "P" : "R";
  const format = detectFormat(input.mimeType, input.filename);

  let pages: string[];
  if (format === "pdf") {
    pages = await parsePdf(input.buffer);
  } else if (format === "docx") {
    pages = paginate(await parseDocx(input.buffer));
  } else {
    pages = paginate(input.buffer.toString("utf-8"));
  }

  const chunks = pages.flatMap((pageText, i) => chunkPage(pageText, i + 1, prefix));
  const fullText = chunks.map((c) => c.text).join("\n\n");

  if (chunks.length === 0) {
    throw new Error(
      `No extractable text found in "${input.filename}". A scanned/image-only document needs OCR before review.`,
    );
  }

  return {
    kind: input.kind,
    filename: input.filename,
    mimeType: input.mimeType,
    pageCount: pages.length,
    chunks,
    fullText,
  };
}

/** Render a parsed document as id-annotated text for an LLM prompt. */
export function renderChunks(doc: ParsedDoc, chunkIds?: Set<string>): string {
  return doc.chunks
    .filter((c) => !chunkIds || chunkIds.has(c.id))
    .map((c) => `[${c.id}] (p.${c.page}) ${c.text}`)
    .join("\n\n");
}
