import type { ParsedDoc } from "@/engine/types";

/**
 * Document Intake agent (deterministic). The actual parsing happens in
 * `src/lib/docparse` before the graph runs; this stage validates the parsed
 * documents and raises warnings that surface on the final report.
 */
export type IntakeResult = { warnings: string[] };

export function runIntake(proposal: ParsedDoc, rfp: ParsedDoc | null): IntakeResult {
  const warnings: string[] = [];

  if (proposal.chunks.length < 3) {
    warnings.push(
      "Proposal contains very little extractable text — parsing may be incomplete (a scanned/image PDF needs OCR before review).",
    );
  }
  if (!rfp) {
    warnings.push(
      "No RFP/TOR supplied — requirement matching is skipped; the review covers completeness, risk and quality only.",
    );
  } else if (rfp.chunks.length < 2) {
    warnings.push(
      "RFP/TOR contains very little extractable text — requirement extraction may be incomplete.",
    );
  }
  return { warnings };
}
