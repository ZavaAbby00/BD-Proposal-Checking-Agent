import { requireOrgAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { DEFAULT_RUBRIC, type ScoreWeights, type VerdictThresholds } from "@/engine/rubric";
import { updateSettings } from "@/lib/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireOrgAdmin();
  if (!admin.organizationId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">No organization.</Card>
    );
  }

  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId: admin.organizationId },
  });

  const mandatory =
    (settings?.mandatorySections as string[]) ?? DEFAULT_RUBRIC.mandatorySections;
  const recommended =
    (settings?.recommendedSections as string[]) ?? DEFAULT_RUBRIC.recommendedSections;
  const reqCategories =
    (settings?.requirementCategories as string[]) ??
    DEFAULT_RUBRIC.requirementCategories;
  const riskCategories =
    (settings?.riskCategories as string[]) ?? DEFAULT_RUBRIC.riskCategories;
  const weights =
    (settings?.scoreWeights as ScoreWeights) ?? DEFAULT_RUBRIC.scoreWeights;
  const thresholds =
    (settings?.verdictThresholds as VerdictThresholds) ??
    DEFAULT_RUBRIC.verdictThresholds;

  return (
    <form action={updateSettings} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI model</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Gemini model">
            <Input name="geminiModel" defaultValue={settings?.geminiModel ?? "gemini-3.5-flash"} />
          </Field>
          <Field label="Temperature">
            <Input
              name="temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              defaultValue={settings?.temperature ?? 0.2}
            />
          </Field>
          <Field label="Max output tokens">
            <Input
              name="maxOutputTokens"
              type="number"
              step="512"
              defaultValue={settings?.maxOutputTokens ?? 16384}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input
              type="checkbox"
              name="langfuseEnabled"
              defaultChecked={settings?.langfuseEnabled ?? true}
            />
            Enable Langfuse tracing (when keys are configured)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review rubric</CardTitle>
          <p className="text-sm text-muted-foreground">
            One item per line. The mandatory list drives the Completeness agent
            and the Scoring agent&apos;s hard cap — a missing mandatory section
            forces a NOT_READY verdict.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Mandatory sections">
            <Textarea
              name="mandatorySections"
              rows={7}
              defaultValue={mandatory.join("\n")}
            />
          </Field>
          <Field label="Recommended sections">
            <Textarea
              name="recommendedSections"
              rows={7}
              defaultValue={recommended.join("\n")}
            />
          </Field>
          <Field label="Requirement categories">
            <Textarea
              name="requirementCategories"
              rows={6}
              defaultValue={reqCategories.join("\n")}
            />
          </Field>
          <Field label="Risk categories">
            <Textarea
              name="riskCategories"
              rows={6}
              defaultValue={riskCategories.join("\n")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Weight — completeness">
            <Input name="weightCompleteness" type="number" step="0.05" defaultValue={weights.completeness} />
          </Field>
          <Field label="Weight — RFP coverage">
            <Input name="weightCoverage" type="number" step="0.05" defaultValue={weights.coverage} />
          </Field>
          <Field label="Weight — risk">
            <Input name="weightRisk" type="number" step="0.05" defaultValue={weights.risk} />
          </Field>
          <Field label="READY threshold (≥)">
            <Input name="thresholdReady" type="number" defaultValue={thresholds.ready} />
          </Field>
          <Field label="NEEDS_REVISION threshold (≥)">
            <Input name="thresholdRevision" type="number" defaultValue={thresholds.needsRevision} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Save settings</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
