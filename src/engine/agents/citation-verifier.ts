import { z } from "zod";
import {
  Citation,
  CommercialRisk,
  CompletenessItem,
  Gap,
  RequirementMatchItem,
  type ComplianceOutput,
  type CompletenessOutput,
  type RiskOutput,
  type SectionsOutput,
} from "@/engine/schema";
import type { ParsedDoc } from "@/engine/types";
import type { Rubric } from "@/engine/rubric";
import type { Requirement } from "@/engine/agents/requirement-analyst";
import { truncate } from "@/engine/util";

type TCitation = z.infer<typeof Citation>;
type TCompletenessItem = z.infer<typeof CompletenessItem>;
type TRequirementMatchItem = z.infer<typeof RequirementMatchItem>;
type TGap = z.infer<typeof Gap>;
type TCommercialRisk = z.infer<typeof CommercialRisk>;

export type VerifiedFindings = {
  completeness: TCompletenessItem[];
  requirementMatch: TRequirementMatchItem[];
  gaps: TGap[];
  risks: TCommercialRisk[];
  valueProposition: { assessment: "strong" | "adequate" | "weak"; note: string };
  citations: TCitation[];
  warnings: string[];
};

export type VerifyInput = {
  proposal: ParsedDoc;
  rfp: ParsedDoc | null;
  rubric: Rubric;
  requirements: Requirement[];
  sections: SectionsOutput["sections"];
  completenessRaw: CompletenessOutput;
  complianceRaw: ComplianceOutput;
  riskRaw: RiskOutput;
};

/**
 * Citation Verifier agent (deterministic grounding guardrail).
 *
 *  - Every cited chunk id must resolve to a real chunk; invalid ids are dropped.
 *  - A "present"/"covered"/"partial" claim with NO surviving citation is
 *    downgraded to "missing" — the engine never asserts something it cannot
 *    point to in the source document.
 *  - Missing mandatory sections are turned into deterministic critical gaps so
 *    they always reach the Scoring agent's hard cap.
 */
export function verifyCitations(input: VerifyInput): VerifiedFindings {
  const warnings: string[] = [];

  // Index every chunk across both documents.
  const allChunks = [
    ...input.proposal.chunks.map((c) => ({ ...c, docKind: "proposal" as const })),
    ...(input.rfp?.chunks ?? []).map((c) => ({ ...c, docKind: "rfp" as const })),
  ];
  const validIds = new Set(allChunks.map((c) => c.id));
  const chunkById = new Map(allChunks.map((c) => [c.id, c]));
  const orderIndex = new Map(allChunks.map((c, i) => [c.id, i]));

  // chunk id -> section name (from the Section Mapper's evidence).
  const chunkSection = new Map<string, string>();
  for (const s of input.sections) {
    for (const id of s.evidenceChunkIds) {
      if (!chunkSection.has(id)) chunkSection.set(id, s.canonicalName);
    }
  }

  const referenced = new Set<string>();
  const keepValid = (ids: string[]): string[] => {
    const valid = ids.filter((id) => validIds.has(id));
    for (const id of valid) referenced.add(id);
    return valid;
  };

  // ── Completeness — one item per rubric section, downgrade unverified claims ──
  const mandatory = new Set(input.rubric.mandatorySections);
  const rubricSections = [
    ...input.rubric.mandatorySections,
    ...input.rubric.recommendedSections,
  ];
  const rawByName = new Map(
    input.completenessRaw.items.map((i) => [i.section.trim().toLowerCase(), i]),
  );

  const completenessStaged = rubricSections.map((section) => {
    const raw = rawByName.get(section.trim().toLowerCase());
    const isMandatory = mandatory.has(section);
    if (!raw) {
      warnings.push(`Section "${section}" was not assessed by the Completeness agent — treated as missing.`);
      return {
        section,
        mandatory: isMandatory,
        status: "missing" as const,
        quality: null,
        note: "Not assessed by the Completeness agent — treated as missing.",
        evidence: [] as string[],
      };
    }
    const evidence = keepValid(raw.evidenceChunkIds ?? []);
    let status = raw.status;
    let quality = raw.quality;
    let note = raw.note;
    if ((status === "present" || status === "partial") && evidence.length === 0) {
      warnings.push(`Completeness claim for "${section}" (${status}) had no resolvable citation — downgraded to missing.`);
      status = "missing";
      quality = null;
      note = `${note} [Downgraded: claimed ${raw.status} but no citation resolved to the document.]`;
    }
    return { section, mandatory: isMandatory, status, quality, note, evidence };
  });

  // ── Compliance — requirement match, downgrade unverified claims ──
  const reqById = new Map(input.requirements.map((r) => [r.id, r]));
  const complianceByReq = new Map(
    input.complianceRaw.items.map((i) => [i.requirementId, i]),
  );
  for (const item of input.complianceRaw.items) {
    if (!reqById.has(item.requirementId)) {
      warnings.push(`Compliance result references unknown requirement "${item.requirementId}" — ignored.`);
    }
  }

  const requirementStaged = input.requirements.map((req) => {
    const raw = complianceByReq.get(req.id);
    if (!raw) {
      return {
        requirementId: req.id,
        requirement: req.text,
        category: req.category,
        mandatory: req.mandatory,
        status: "missing" as const,
        note: "Not assessed by the Compliance agent — treated as missing.",
        evidence: [] as string[],
      };
    }
    const evidence = keepValid(raw.evidenceChunkIds ?? []);
    let status = raw.status;
    let note = raw.note;
    if ((status === "covered" || status === "partial") && evidence.length === 0) {
      warnings.push(`Compliance claim for ${req.id} (${status}) had no resolvable citation — downgraded to missing.`);
      status = "missing";
      note = `${note} [Downgraded: claimed ${raw.status} but no citation resolved to the document.]`;
    }
    return {
      requirementId: req.id,
      requirement: req.text,
      category: req.category,
      mandatory: req.mandatory,
      status,
      note,
      evidence,
    };
  });

  // ── Risk — keep agent gaps (non missing_section) + commercial risks ──
  const gapStaged = input.riskRaw.gaps
    .filter((g) => g.type !== "missing_section")
    .map((g) => ({
      type: g.type,
      severity: g.severity,
      description: g.description,
      evidence: keepValid(g.evidenceChunkIds ?? []),
    }));

  // Deterministic critical gaps for every missing mandatory section.
  for (const item of completenessStaged) {
    if (item.mandatory && item.status === "missing") {
      gapStaged.unshift({
        type: "missing_section",
        severity: "critical",
        description: `Mandatory section "${item.section}" is missing — the proposal cannot be submitted without it.`,
        evidence: [],
      });
    }
  }

  const riskStaged = input.riskRaw.commercialRisks.map((r) => ({
    category: r.category,
    severity: r.severity,
    description: r.description,
    evidence: keepValid(r.evidenceChunkIds ?? []),
  }));

  // ── Build the citation list from every surviving reference, in doc order ──
  const ordered = [...referenced].sort(
    (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
  );
  const citeIdByChunk = new Map<string, string>();
  const citations: TCitation[] = ordered.map((chunkId, i) => {
    const chunk = chunkById.get(chunkId)!;
    const display = `C${i + 1}`;
    citeIdByChunk.set(chunkId, display);
    return {
      id: display,
      docKind: chunk.docKind,
      page: chunk.page,
      section: chunkSection.get(chunkId) ?? null,
      quote: truncate(chunk.text, 240),
    };
  });
  const toCitations = (ids: string[]): string[] =>
    ids.map((id) => citeIdByChunk.get(id)).filter((x): x is string => Boolean(x));

  // ── Finalize: attach display citation ids and stable gap/risk ids ──
  return {
    completeness: completenessStaged.map((c) => ({
      section: c.section,
      mandatory: c.mandatory,
      status: c.status,
      quality: c.quality,
      note: c.note,
      citationIds: toCitations(c.evidence),
    })),
    requirementMatch: requirementStaged.map((r) => ({
      requirementId: r.requirementId,
      requirement: r.requirement,
      category: r.category,
      mandatory: r.mandatory,
      status: r.status,
      note: r.note,
      citationIds: toCitations(r.evidence),
    })),
    gaps: gapStaged.map((g, i) => ({
      id: `G${i + 1}`,
      type: g.type,
      severity: g.severity,
      description: g.description,
      citationIds: toCitations(g.evidence),
    })),
    risks: riskStaged.map((r, i) => ({
      id: `CR${i + 1}`,
      category: r.category,
      severity: r.severity,
      description: r.description,
      citationIds: toCitations(r.evidence),
    })),
    valueProposition: input.riskRaw.valueProposition,
    citations,
    warnings,
  };
}
