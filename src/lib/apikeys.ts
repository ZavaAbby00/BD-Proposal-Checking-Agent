import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Organization-scoped API keys for the MCP surface. Only the SHA-256 hash is
 * stored; the plaintext key is shown to the admin exactly once at creation.
 */

const KEY_PREFIX = "pck"; // proposal-checker key

export type GeneratedApiKey = {
  /** The full secret — shown to the user once, never stored. */
  plaintext: string;
  /** A short non-secret prefix shown in the admin UI to identify the key. */
  prefix: string;
  /** SHA-256 hash stored in the database. */
  hashed: string;
};

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}_${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    hashed: hashApiKey(plaintext),
  };
}

/** Constant-time comparison of two hex hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Extract a bearer token from an Authorization header value. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
