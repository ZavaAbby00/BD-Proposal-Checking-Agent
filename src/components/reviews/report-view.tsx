import {
  AlertTriangle,
  Download,
  ExternalLink,
  Lightbulb,
  ListChecks,
  Quote,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import type { ProposalReviewReport } from "@/engine/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  matchStatusDisplay,
  scoreColorClass,
  sectionStatusDisplay,
  severityDisplay,
  verdictDisplay,
} from "@/lib/display";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function CiteRefs({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => (
        <a
          key={id}
          href={`#cite-${id}`}
          className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
        >
          {id}
        </a>
      ))}
    </span>
  );
}

export function ReportView({
  report,
  reviewId,
}: {
  report: ProposalReviewReport;
  reviewId: string;
}) {
  const score = report.readinessScore;
  const verdict = verdictDisplay[score.verdict] ?? verdictDisplay.NOT_READY;
  const completeness = report.completenessChecklist;
  const presentCount = completeness.filter((c) => c.status === "present").length;
  const gaps = [...report.keyGaps].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
  const risks = [...report.commercialRisks].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
  const recommendations = [...report.recommendations].sort(
    (a, b) => a.priority - b.priority,
  );

  return (
    <div className="space-y-5">
      {/* ── Verdict + readiness score ── */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center justify-center sm:w-40">
            <div className={cn("text-5xl font-bold tabular-nums", scoreColorClass(score.score))}>
              {score.score}
            </div>
            <div className="text-xs text-muted-foreground">readiness / 100</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  score.score >= 80
                    ? "bg-success"
                    : score.score >= 55
                      ? "bg-warning"
                      : "bg-destructive",
                )}
                style={{ width: `${score.score}%` }}
              />
            </div>
          </div>
          <div className="flex-1 space-y-2 sm:border-l sm:pl-5">
            <Badge variant={verdict.variant} className="text-sm">
              {verdict.label}
            </Badge>
            <p className="text-sm text-foreground">{score.rationale}</p>
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
              <span>Completeness {score.subScores.completeness}</span>
              <span>·</span>
              <span>
                Requirement coverage{" "}
                {report.requirementMatch.rfpProvided
                  ? score.subScores.requirementCoverage
                  : "n/a"}
              </span>
              <span>·</span>
              <span>Risk penalty {score.subScores.riskPenalty}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Proposal summary ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Proposal summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground">Client</dt>
            <dd>{report.proposalSummary.client ?? "Not stated"}</dd>
            <dt className="text-muted-foreground">Engagement</dt>
            <dd>{report.proposalSummary.engagement}</dd>
            <dt className="text-muted-foreground">Proposed value</dt>
            <dd>{report.proposalSummary.proposedValue ?? "Not stated"}</dd>
          </dl>
          <p className="pt-1 text-muted-foreground">
            {report.proposalSummary.overview}
          </p>
        </CardContent>
      </Card>

      {/* ── Completeness checklist ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            Completeness checklist
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {presentCount}/{completeness.length} sections present
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {completeness.map((item) => {
            const s = sectionStatusDisplay[item.status];
            return (
              <div key={item.section} className="flex gap-3 py-2.5 text-sm">
                <Badge variant={s.variant} className="mt-0.5 h-fit w-20 justify-center">
                  {s.label}
                </Badge>
                <div className="flex-1">
                  <div className="font-medium">
                    {item.section}
                    {item.mandatory && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (mandatory)
                      </span>
                    )}
                    <CiteRefs ids={item.citationIds} />
                  </div>
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Requirement match ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" />
            RFP requirement match
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.requirementMatch.rfpProvided ? (
            <>
              <div className="mb-3 flex gap-4 text-sm">
                <span className="text-success">
                  {report.requirementMatch.summary.covered} covered
                </span>
                <span className="text-warning">
                  {report.requirementMatch.summary.partial} partial
                </span>
                <span className="text-destructive">
                  {report.requirementMatch.summary.missing} missing
                </span>
              </div>
              <div className="divide-y">
                {report.requirementMatch.items.map((item) => {
                  const s = matchStatusDisplay[item.status];
                  return (
                    <div key={item.requirementId} className="flex gap-3 py-2.5 text-sm">
                      <Badge
                        variant={s.variant}
                        className="mt-0.5 h-fit w-20 justify-center"
                      >
                        {s.label}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium">
                          <span className="text-muted-foreground">
                            {item.requirementId}
                          </span>{" "}
                          {item.requirement}
                          {item.mandatory && (
                            <span className="ml-1.5 text-xs font-normal text-destructive">
                              mandatory
                            </span>
                          )}
                          <CiteRefs ids={item.citationIds} />
                        </div>
                        <p className="text-xs text-muted-foreground">{item.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No client brief was supplied — requirement matching was skipped.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Key gaps ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Key gaps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gaps identified.</p>
          ) : (
            gaps.map((gap) => (
              <Finding
                key={gap.id}
                id={gap.id}
                severity={gap.severity}
                tag={gap.type.replace(/_/g, " ")}
                description={gap.description}
                citationIds={gap.citationIds}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Commercial risks ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" />
            Commercial risks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No commercial risks identified.
            </p>
          ) : (
            risks.map((risk) => (
              <Finding
                key={risk.id}
                id={risk.id}
                severity={risk.severity}
                tag={risk.category}
                description={risk.description}
                citationIds={risk.citationIds}
              />
            ))
          )}
          <div className="pt-1 text-sm">
            <span className="text-muted-foreground">Value proposition: </span>
            <span className="font-medium capitalize">
              {report.valueProposition.assessment}
            </span>
            <span className="text-muted-foreground">
              {" "}
              — {report.valueProposition.note}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Recommendations ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4" />
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {recommendations.map((rec, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {rec.priority}
              </div>
              <div className="flex-1">
                <div className="font-medium">{rec.action}</div>
                <p className="text-xs text-muted-foreground">{rec.rationale}</p>
                {rec.relatedTo.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Resolves: {rec.relatedTo.join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Citations ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Quote className="h-4 w-4" />
            Citations
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {report.citations.length} grounded references
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.citations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No citations — findings reference document-wide omissions.
            </p>
          ) : (
            report.citations.map((c) => (
              <div
                key={c.id}
                id={`cite-${c.id}`}
                className="scroll-mt-20 rounded-md border bg-muted/40 p-2.5 text-sm"
              >
                <div className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.id}</span>
                  <span className="capitalize">{c.docKind}</span>
                  {c.page !== null && <span>· page {c.page}</span>}
                  {c.section && <span>· {c.section}</span>}
                </div>
                <p className="italic text-muted-foreground">&ldquo;{c.quote}&rdquo;</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Meta / export ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-xs text-muted-foreground">
          <span>Model: {report.meta.model}</span>
          <span>·</span>
          <span>Reviewed {new Date(report.meta.reviewedAt).toLocaleString()}</span>
          {report.meta.langfuseTraceUrl && (
            <>
              <span>·</span>
              <a
                href={report.meta.langfuseTraceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                Langfuse trace <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <a href={`/api/reviews/${reviewId}/result`}>
              <Download className="h-3.5 w-3.5" />
              Download JSON
            </a>
          </Button>
        </CardContent>
      </Card>

      {report.meta.warnings.length > 0 && (
        <details className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">
            {report.meta.warnings.length} processing warning(s)
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {report.meta.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Finding({
  id,
  severity,
  tag,
  description,
  citationIds,
}: {
  id: string;
  severity: string;
  tag: string;
  description: string;
  citationIds: string[];
}) {
  const s = severityDisplay[severity] ?? severityDisplay.medium;
  return (
    <div className="flex gap-3 text-sm">
      <Badge variant={s.variant} className="mt-0.5 h-fit w-16 justify-center">
        {s.label}
      </Badge>
      <div className="flex-1">
        <div>
          <span className="font-medium">{description}</span>
          <CiteRefs ids={citationIds} />
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {id} · {tag}
        </div>
      </div>
    </div>
  );
}
