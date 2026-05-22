import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { NewReviewForm } from "@/components/reviews/new-review-form";

export default async function NewReviewPage() {
  const user = await requireUser();
  if (!user.organizationId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New review</h1>
        <p className="text-sm text-muted-foreground">
          Provide a proposal draft and, optionally, the client brief it responds
          to. The multi-agent engine will produce a structured checking result.
        </p>
      </div>
      <NewReviewForm />
    </div>
  );
}
