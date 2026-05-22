import type { Chunk, ParsedDoc } from "@/engine/types";

/**
 * `search_proposal` — the retrieval tool used by the Compliance and Risk agents
 * to gather evidence, and exposed directly over MCP so external agents can
 * ground their own reasoning. Deterministic lexical scoring (term frequency),
 * so results are stable and explainable.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "is",
  "are", "be", "as", "at", "by", "it", "this", "that", "from", "will", "shall",
  "must", "should", "we", "our", "your", "their", "all", "any", "each",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export type SearchHit = {
  chunkId: string;
  page: number;
  score: number;
  text: string;
};

/** Rank a document's chunks by lexical relevance to a query. */
export function searchProposal(doc: ParsedDoc, query: string, topK = 6): SearchHit[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  const scored = doc.chunks.map((chunk: Chunk) => {
    const haystack = chunk.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const occ = countOccurrences(haystack, term);
      if (occ > 0) score += 1 + Math.log(occ);
    }
    return { chunkId: chunk.id, page: chunk.page, score, text: chunk.text };
  });

  return scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Run several queries and return the union of hit chunk ids, de-duplicated. */
export function gatherEvidence(
  doc: ParsedDoc,
  queries: string[],
  topKPerQuery = 4,
): Chunk[] {
  const seen = new Map<string, Chunk>();
  const byId = new Map(doc.chunks.map((c) => [c.id, c]));
  for (const query of queries) {
    for (const hit of searchProposal(doc, query, topKPerQuery)) {
      const chunk = byId.get(hit.chunkId);
      if (chunk && !seen.has(chunk.id)) seen.set(chunk.id, chunk);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.page === b.page ? a.id.localeCompare(b.id) : a.page - b.page,
  );
}
