/**
 * Typed access to environment variables. Accessors (not eager validation) so a
 * missing optional var never breaks the build — callers decide what is required.
 */

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  superadminEmails(): string[] {
    return list(process.env.SUPERADMIN_EMAILS).map((e) => e.toLowerCase());
  },
  gcpProject(): string {
    return process.env.GOOGLE_CLOUD_PROJECT ?? "";
  },
  vertexLocation(): string {
    return process.env.VERTEX_LOCATION || "global";
  },
  geminiModel(): string {
    return process.env.GEMINI_MODEL || "gemini-3.5-flash";
  },
  gcsBucket(): string {
    return process.env.GCS_BUCKET ?? "";
  },
  langfuse() {
    return {
      publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
      secretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
      host: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
    };
  },
  langfuseEnabled(): boolean {
    return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
  },
  appUrl(): string {
    return process.env.AUTH_URL || "http://localhost:3000";
  },
};
