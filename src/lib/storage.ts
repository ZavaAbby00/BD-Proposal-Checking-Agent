import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * File storage abstraction. Uses a Google Cloud Storage bucket when GCS_BUCKET
 * is set; otherwise falls back to a local `.uploads/` directory so the app is
 * fully runnable in local development without any cloud setup.
 */

const LOCAL_ROOT = path.join(process.cwd(), ".uploads");

function safeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .filter(Boolean)
    .join("/");
}

type GcsBucket = import("@google-cloud/storage").Bucket;
let cachedBucket: GcsBucket | null = null;

async function bucket(): Promise<GcsBucket> {
  if (!cachedBucket) {
    const { Storage } = await import("@google-cloud/storage");
    const project = env.gcpProject();
    cachedBucket = new Storage(project ? { projectId: project } : {}).bucket(env.gcsBucket());
  }
  return cachedBucket;
}

export function storageBackend(): "gcs" | "local" {
  return env.gcsBucket() ? "gcs" : "local";
}

/** Persist a file and return its storage key. */
export async function putObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const cleanKey = safeKey(key);
  if (storageBackend() === "gcs") {
    await (await bucket()).file(cleanKey).save(data, { contentType, resumable: false });
  } else {
    const full = path.join(LOCAL_ROOT, cleanKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  return cleanKey;
}

/** Retrieve a previously stored file. */
export async function getObject(key: string): Promise<Buffer> {
  const cleanKey = safeKey(key);
  if (storageBackend() === "gcs") {
    const [contents] = await (await bucket()).file(cleanKey).download();
    return contents;
  }
  return fs.readFile(path.join(LOCAL_ROOT, cleanKey));
}

/** Build a storage key namespaced by organization. */
export function objectKey(organizationId: string, ...parts: string[]): string {
  return ["org", organizationId, ...parts].join("/");
}
