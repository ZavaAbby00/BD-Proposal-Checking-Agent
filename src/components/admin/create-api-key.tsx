"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound } from "lucide-react";
import { createApiKey } from "@/lib/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateApiKey() {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"FULL" | "READ_ONLY">("FULL");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setCreated(null);
    const result = await createApiKey(name.trim(), scope);
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setCreated(result.plaintext);
    setName("");
    toast.success("API key created");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Create an MCP API key
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          API keys authenticate the MCP server. Full-scope keys can run reviews;
          read-only keys can only list and fetch them.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. CI pipeline)"
            className="max-w-xs"
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "FULL" | "READ_ONLY")}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="FULL">Full access</option>
            <option value="READ_ONLY">Read only</option>
          </select>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create key"}
          </Button>
        </form>

        {created && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="mb-1.5 text-xs font-medium text-warning">
              Copy this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 text-xs">
                {created}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(created);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
