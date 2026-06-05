import { google } from "googleapis";

export type DriveFile = {
  id: string;
  name: string;
  /** Present when requested from the API; used to skip folders and non-images. */
  mimeType?: string;
};

/** Auth type accepted by google.drive() — avoid cross-package GoogleAuth alias mismatch in CI. */
export type DriveAuth = NonNullable<Parameters<typeof google.drive>[0]>["auth"];

export function createDriveAuth(serviceAccount: Record<string, unknown>): DriveAuth {
  return new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  }) as DriveAuth;
}

/**
 * List files in a Google Drive folder.
 */
export async function listFilesInFolder(
  folderId: string,
  auth: DriveAuth,
): Promise<DriveFile[]> {
  const drive = google.drive({ version: "v3", auth });
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 100,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const list = res.data.files ?? [];
    for (const f of list) {
      if (f.id && f.name) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType ?? undefined,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/**
 * Build a viewable URL for a Drive file (for images).
 * Note: works only if file/folder is shared publicly; catalog uses proxy endpoint instead.
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
export async function getFileStream(
  fileId: string,
  auth: DriveAuth,
): Promise<DriveFileStream> {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  const stream = res.data as NodeJS.ReadableStream;
  const mimeType = (res.headers["content-type"] as string) || undefined;
  return { stream, mimeType };
}
