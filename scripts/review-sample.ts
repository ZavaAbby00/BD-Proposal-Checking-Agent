/**
 * Headless end-to-end test of the multi-agent engine.
 *
 *   npm run review:sample                       # default sample proposal + TOR
 *   npm run review:sample -- <proposal> <rfp>   # custom files (pdf/docx/txt)
 *   npm run review:sample -- <proposal> none    # review without an RFP
 *
 * Requires Vertex AI access (Application Default Credentials).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseDocument } from "@/lib/docparse";
import { runReview } from "@/engine";
import { DEFAULT_RUBRIC } from "@/engine/rubric";
import { env } from "@/lib/env";

try {
  process.loadEnvFile(".env");
} catch {
  /* .env is optional — environment may already be populated */
}

function mimeFor(path: string): string {
  if (path.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (path.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}

async function main() {
  const proposalPath = process.argv[2] ?? "samples/proposal-pt-sentosa.txt";
  const rfpArg = process.argv[3] ?? "samples/tor-pt-sentosa.txt";

  console.log("AI Proposal Checking Agent — sample run");
  console.log(`  proposal : ${proposalPath}`);
  console.log(`  rfp/tor  : ${rfpArg}`);

  const proposal = await parseDocument({
    buffer: readFileSync(proposalPath),
    mimeType: mimeFor(proposalPath),
    filename: basename(proposalPath),
    kind: "proposal",
  });
  const rfp =
    rfpArg && rfpArg.toLowerCase() !== "none"
      ? await parseDocument({
          buffer: readFileSync(rfpArg),
          mimeType: mimeFor(rfpArg),
          filename: basename(rfpArg),
          kind: "rfp",
        })
      : null;

  console.log(
    `  parsed   : proposal ${proposal.pageCount}p / ${proposal.chunks.length} chunks` +
      (rfp ? `, rfp ${rfp.chunks.length} chunks` : ", no rfp"),
  );
  console.log(`  model    : ${env.geminiModel()} @ ${env.vertexLocation()}`);
  console.log("\nRunning multi-agent review...\n");

  const started = Date.now();
  const report = await runReview(
    {
      proposal,
      rfp,
      reviewId: `sample-${Date.now()}`,
      config: {
        organizationId: "sample-org",
        rubric: DEFAULT_RUBRIC,
        model: { model: env.geminiModel(), temperature: 0.2, maxOutputTokens: 16384 },
        langfuse: env.langfuseEnabled()
          ? { enabled: true, ...env.langfuse() }
          : undefined,
      },
    },
    { onProgress: (e) => console.log(`  done: ${e.agent}`) },
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  writeFileSync("samples/last-review.json", JSON.stringify(report, null, 2));

  const r = report.readinessScore;
  const c = report.completenessChecklist;
  console.log(`\n──────────────── Review complete in ${seconds}s ────────────────`);
  console.log(`Verdict          : ${r.verdict}`);
  console.log(`Readiness score  : ${r.score}/100`);
  console.log(`Rationale        : ${r.rationale}`);
  console.log(
    `Completeness     : ${c.filter((x) => x.status === "present").length}/${c.length} present, ` +
      `${c.filter((x) => x.status === "partial").length} partial, ` +
      `${c.filter((x) => x.status === "missing").length} missing`,
  );
  console.log(
    `Requirement match: ${report.requirementMatch.summary.covered} covered / ` +
      `${report.requirementMatch.summary.partial} partial / ` +
      `${report.requirementMatch.summary.missing} missing`,
  );
  console.log(`Key gaps         : ${report.keyGaps.length}`);
  console.log(`Commercial risks : ${report.commercialRisks.length}`);
  console.log(`Recommendations  : ${report.recommendations.length}`);
  console.log(`Citations        : ${report.citations.length}`);
  if (report.meta.warnings.length > 0) {
    console.log(`Warnings         : ${report.meta.warnings.length}`);
  }
  console.log(`\nFull structured report written to samples/last-review.json`);
}

main().catch((err) => {
  console.error("\nReview failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
