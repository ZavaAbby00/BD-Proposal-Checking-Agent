/**
 * Evaluation harness — runs the engine over a golden dataset and checks the
 * output is correct, grounded, and free of the critical "false READY" failure.
 *
 *   npm run eval
 *
 * Requires Vertex AI access (Application Default Credentials).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseDocument } from "@/lib/docparse";
import { runReview } from "@/engine";
import { DEFAULT_RUBRIC } from "@/engine/rubric";
import { env } from "@/lib/env";

try {
  process.loadEnvFile(".env");
} catch {
  /* .env optional */
}

type EvalCase = {
  name: string;
  description: string;
  proposal: string;
  rfp: string | null;
  expect: { verdict: string; mandatoryMissing: string[] };
};

function mimeFor(path: string): string {
  if (path.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (path.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}

async function parse(path: string, kind: "proposal" | "rfp") {
  return parseDocument({
    buffer: readFileSync(path),
    mimeType: mimeFor(path),
    filename: basename(path),
    kind,
  });
}

async function main() {
  const dataset = JSON.parse(
    readFileSync("eval/dataset.json", "utf-8"),
  ) as EvalCase[];

  console.log(`Running ${dataset.length} eval case(s) with ${env.geminiModel()}...\n`);
  let passed = 0;
  let failed = 0;

  for (const testCase of dataset) {
    const proposal = await parse(testCase.proposal, "proposal");
    const rfp = testCase.rfp ? await parse(testCase.rfp, "rfp") : null;

    const report = await runReview({
      proposal,
      rfp,
      reviewId: `eval-${testCase.name}`,
      config: {
        organizationId: "eval-org",
        rubric: DEFAULT_RUBRIC,
        model: { model: env.geminiModel(), temperature: 0.2, maxOutputTokens: 16384 },
        langfuse: env.langfuseEnabled() ? { enabled: true, ...env.langfuse() } : undefined,
      },
    });

    const issues: string[] = [];

    // 1. Verdict accuracy.
    if (report.readinessScore.verdict !== testCase.expect.verdict) {
      issues.push(
        `verdict ${report.readinessScore.verdict} (expected ${testCase.expect.verdict})`,
      );
    }

    // 2. Expected mandatory sections flagged missing.
    for (const section of testCase.expect.mandatoryMissing) {
      const item = report.completenessChecklist.find((c) => c.section === section);
      if (!item || item.status !== "missing") {
        issues.push(`expected "${section}" to be missing, got ${item?.status ?? "absent"}`);
      }
    }

    // 3. Critical guardrail — a missing mandatory section must never be READY.
    const missingMandatory = report.completenessChecklist.some(
      (c) => c.mandatory && c.status === "missing",
    );
    if (missingMandatory && report.readinessScore.verdict === "READY") {
      issues.push("FALSE READY — a mandatory section is missing but the verdict is READY");
    }

    // 4. Groundedness — every cited id must resolve to a real citation.
    const citationIds = new Set(report.citations.map((c) => c.id));
    const referenced = [
      ...report.completenessChecklist,
      ...report.requirementMatch.items,
      ...report.keyGaps,
      ...report.commercialRisks,
    ].flatMap((f) => f.citationIds);
    const unresolved = referenced.filter((id) => !citationIds.has(id));
    if (unresolved.length > 0) {
      issues.push(`${unresolved.length} unresolved citation reference(s)`);
    }

    if (issues.length === 0) {
      passed += 1;
      console.log(`PASS  ${testCase.name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${testCase.name}`);
      for (const issue of issues) console.log(`        - ${issue}`);
    }
    console.log(
      `        verdict=${report.readinessScore.verdict} score=${report.readinessScore.score}` +
        ` citations=${report.citations.length} gaps=${report.keyGaps.length}\n`,
    );
  }

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Eval failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
