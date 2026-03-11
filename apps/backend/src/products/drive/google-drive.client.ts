import { google } from "googleapis";

export type DriveFile = {
  id: string;
  name: string;
};

/**
 * List files in a Google Drive folder.
 * Requires: GOOGLE_DRIVE_FOLDER_ID, and either GOOGLE_APPLICATION_CREDENTIALS (path to JSON key)
 * or GOOGLE_SERVICE_ACCOUNT_JSON (stringified JSON).
 */
export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 100,
      pageToken,
      fields: "nextPageToken, files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const list = res.data.files ?? [];
    for (const f of list) {
      if (f.id && f.name) files.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/**
 * Build a viewable URL for a Drive file (for images).
 * Note: works only if file/folder is shared publicly; otherwise use proxy endpoint.
 */
export function getDriveFileViewUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export type DriveFileStream = {
  stream: NodeJS.ReadableStream;
  mimeType?: string;
};

/**
 * Get file content as stream (for proxying to client; uses service account auth).
 */
export async function getFileStream(fileId: string): Promise<DriveFileStream> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );
  const stream = res.data as NodeJS.ReadableStream;
  const mimeType = (res.headers["content-type"] as string) || undefined;
  return { stream, mimeType };
}

function getAuth() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const jsonString = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (jsonString) {
    try {
      const keys = JSON.parse(jsonString);
      return new google.auth.GoogleAuth({
        credentials: keys,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is set but invalid JSON. Use path GOOGLE_APPLICATION_CREDENTIALS or valid JSON string.",
      );
    }
  }

  if (credentialsPath) {
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
  }

  throw new Error(
    "Google Drive credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS (path to key JSON) or GOOGLE_SERVICE_ACCOUNT_JSON (JSON string).",
  );
}
