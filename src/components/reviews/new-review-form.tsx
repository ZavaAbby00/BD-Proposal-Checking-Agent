"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RfpSource = "upload" | "none";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: typeof Upload }[];
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.icon ? <opt.icon className="h-3.5 w-3.5" /> : null}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function NewReviewForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rfpSource, setRfpSource] = useState<RfpSource>("upload");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("rfpSource", rfpSource);

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", { method: "POST", body: formData });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "Failed to start the review.");
      }
      toast.success("Review started — the agents are working.");
      router.push(`/reviews/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proposal draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            name="proposalFile"
            type="file"
            accept=".pdf,.docx,.txt,.md"
            required
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            PDF, DOCX or plain text, up to 20 MB. To review a Google Doc, export
            it to PDF or DOCX first.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client brief / RFP / TOR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Segmented
            value={rfpSource}
            onChange={setRfpSource}
            options={[
              { value: "upload", label: "Upload file", icon: Upload },
              { value: "none", label: "No brief", icon: FileText },
            ]}
          />
          {rfpSource === "upload" && (
            <Input
              name="rfpFile"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              required
              className="cursor-pointer"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {rfpSource === "none"
              ? "Without a brief the review covers completeness, risk and quality only — requirement matching is skipped."
              : "The brief enables requirement-by-requirement compliance matching."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">Review title (optional)</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. PT Sentosa — Managed SOC proposal"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              Starting…
            </>
          ) : (
            "Run review"
          )}
        </Button>
      </div>
    </form>
  );
}
