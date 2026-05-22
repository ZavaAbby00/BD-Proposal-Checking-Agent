"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, CircleDashed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PIPELINE_AGENTS, agentLabel } from "@/lib/display";
import { cn } from "@/lib/utils";

type StatusResponse = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: { completed: string[]; total: number };
  error: string | null;
};

export function ReviewProgress({
  reviewId,
  initialCompleted,
}: {
  reviewId: string;
  initialCompleted: string[];
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState<string[]>(initialCompleted);
  const [status, setStatus] = useState<StatusResponse["status"]>("RUNNING");
  const finished = useRef(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/reviews/${reviewId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (!active) return;
        setCompleted(data.progress?.completed ?? []);
        setStatus(data.status);
        if (
          (data.status === "SUCCEEDED" || data.status === "FAILED") &&
          !finished.current
        ) {
          finished.current = true;
          router.refresh();
        }
      } catch {
        /* transient — keep polling */
      }
    }

    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reviewId, router]);

  const completedSet = new Set(completed);
  const activeIndex = PIPELINE_AGENTS.findIndex((a) => !completedSet.has(a));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          {status === "QUEUED" ? "Review queued" : "Review in progress"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The orchestrator is coordinating the specialist agents. This page
          updates automatically.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {PIPELINE_AGENTS.map((agent, i) => {
            const done = completedSet.has(agent);
            const running = !done && i === activeIndex;
            return (
              <li
                key={agent}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                  done && "text-foreground",
                  running && "bg-muted font-medium",
                  !done && !running && "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="h-4 w-4 text-success" />
                ) : running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CircleDashed className="h-4 w-4" />
                )}
                {agentLabel(agent)}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
