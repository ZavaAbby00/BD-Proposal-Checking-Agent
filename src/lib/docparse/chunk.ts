import type { Chunk } from "@/engine/types";

const TARGET_CHARS = 700;
const MAX_CHARS = 1400;

/**
 * Split one page of text into citation-anchored chunks. Chunk ids are stable
 * within a document: `{prefix}{page}-{idx}` (e.g. P3-002, R1-001).
 */
export function chunkPage(rawText: string, page: number, prefix: "P" | "R"): Chunk[] {
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);

  const chunks: Chunk[] = [];
  let buffer = "";

  const flush = () => {
    const text = buffer.trim();
    buffer = "";
    if (text.length === 0) return;
    const idx = String(chunks.length + 1).padStart(3, "0");
    chunks.push({ id: `${prefix}${page}-${idx}`, page, text });
  };

  for (const para of paragraphs) {
    if (para.length > MAX_CHARS) {
      flush();
      for (let i = 0; i < para.length; i += MAX_CHARS) {
        buffer = para.slice(i, i + MAX_CHARS);
        flush();
      }
      continue;
    }
    if (buffer.length + para.length > MAX_CHARS) flush();
    buffer = buffer ? `${buffer}\n${para}` : para;
    if (buffer.length >= TARGET_CHARS) flush();
  }
  flush();
  return chunks;
}

/**
 * Split a continuous text (DOCX / plain text — no native pages) into synthetic
 * pages at paragraph boundaries so citations still carry a page-like anchor.
 */
export function paginate(text: string, charsPerPage = 3200): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const pages: string[] = [];
  let buffer = "";
  for (const para of paragraphs) {
    if (buffer && buffer.length + para.length > charsPerPage) {
      pages.push(buffer);
      buffer = "";
    }
    buffer = buffer ? `${buffer}\n\n${para}` : para;
  }
  if (buffer.trim()) pages.push(buffer);
  return pages.length > 0 ? pages : [text];
}
