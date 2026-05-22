import { extractText, getDocumentProxy } from "unpdf";

/** Extract text from a PDF, one string per page. */
export async function parsePdf(buffer: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  // With mergePages: false, `text` is an array of per-page strings.
  if (Array.isArray(text)) return text.map((t) => t ?? "");
  return [String(text ?? "")];
}
