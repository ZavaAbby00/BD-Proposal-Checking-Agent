import { google } from "googleapis";

/** Extract a Google Docs file id from a share URL or a raw id. */
export function parseGoogleDocId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export type GoogleDocExport = {
  filename: string;
  text: string;
};

/**
 * Export a Google Doc as plain text using the signed-in user's Drive token.
 * Requires the `drive.readonly` scope granted at sign-in.
 */
export async function exportGoogleDoc(
  fileId: string,
  accessToken: string,
): Promise<GoogleDocExport> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({ fileId, fields: "name,mimeType" });
  if (meta.data.mimeType !== "application/vnd.google-apps.document") {
    throw new Error("The provided link is not a Google Docs document.");
  }

  const exported = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" },
  );

  return {
    filename: `${meta.data.name ?? "google-doc"}.txt`,
    text: typeof exported.data === "string" ? exported.data : String(exported.data ?? ""),
  };
}
