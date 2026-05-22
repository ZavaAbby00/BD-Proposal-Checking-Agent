/** Presentation helpers — map domain enums to labels and badge variants. */

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success"
  | "warning"
  | "muted";

export const verdictDisplay: Record<string, { label: string; variant: BadgeVariant }> = {
  READY: { label: "Ready to submit", variant: "success" },
  NEEDS_REVISION: { label: "Needs revision", variant: "warning" },
  NOT_READY: { label: "Not ready", variant: "destructive" },
};

export const reviewStatusDisplay: Record<string, { label: string; variant: BadgeVariant }> = {
  QUEUED: { label: "Queued", variant: "muted" },
  RUNNING: { label: "Running", variant: "secondary" },
  SUCCEEDED: { label: "Complete", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export const severityDisplay: Record<string, { label: string; variant: BadgeVariant }> = {
  low: { label: "Low", variant: "muted" },
  medium: { label: "Medium", variant: "secondary" },
  high: { label: "High", variant: "warning" },
  critical: { label: "Critical", variant: "destructive" },
};

export const sectionStatusDisplay: Record<string, { label: string; variant: BadgeVariant }> = {
  present: { label: "Present", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  missing: { label: "Missing", variant: "destructive" },
};

export const matchStatusDisplay: Record<string, { label: string; variant: BadgeVariant }> = {
  covered: { label: "Covered", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  missing: { label: "Missing", variant: "destructive" },
};

export const AGENT_LABELS: Record<string, string> = {
  intake: "Document Intake",
  "requirement-analyst": "Requirement Analyst",
  "section-mapper": "Section Mapper",
  completeness: "Completeness",
  compliance: "Compliance",
  risk: "Risk",
  "citation-verifier": "Citation Verifier",
  scoring: "Scoring",
  recommendation: "Recommendation",
  "report-assembler": "Report Assembler",
};

/** Ordered agent pipeline — client-safe copy for progress UI. */
export const PIPELINE_AGENTS = [
  "intake",
  "requirement-analyst",
  "section-mapper",
  "completeness",
  "compliance",
  "risk",
  "citation-verifier",
  "scoring",
  "recommendation",
  "report-assembler",
] as const;

export function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name;
}

/** Tailwind text-color class for a 0-100 readiness score. */
export function scoreColorClass(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 55) return "text-warning";
  return "text-destructive";
}
