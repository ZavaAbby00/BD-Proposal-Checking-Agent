import { prisma } from "@/lib/db";

/**
 * Return a valid Google OAuth access token for a user, refreshing it with the
 * stored refresh token if it has expired. Used to call the Drive API when a
 * reviewer ingests a proposal from a Google Docs link.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    throw new Error("No Google account is linked to this user.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (account.access_token && account.expires_at && account.expires_at > nowSeconds + 60) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("Google session expired and no refresh token is available — please sign in again.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(`Google token refresh failed: ${data.error ?? response.status}`);
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: nowSeconds + (data.expires_in ?? 3600),
    },
  });
  return data.access_token;
}
