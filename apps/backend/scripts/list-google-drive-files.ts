/**
 * Полный список объектов в папке Google Drive (прямые дети, как у синка фото).
 *
 * Запуск из apps/backend (подхватится .env):
 *   npx ts-node scripts/list-google-drive-files.ts
 *   npx ts-node scripts/list-google-drive-files.ts <folderId>
 *   npx ts-node scripts/list-google-drive-files.ts --names-only
 *   npx ts-node scripts/list-google-drive-files.ts <folderId> --names-only
 *
 * Нужны: GOOGLE_DRIVE_FOLDER_ID (если folderId не передан) и
 * GOOGLE_APPLICATION_CREDENTIALS или GOOGLE_SERVICE_ACCOUNT_JSON.
 */

import "dotenv/config";
import { listFilesInFolder } from "../src/products/drive/google-drive.client";

function parseArgs(): { folderId: string | undefined; namesOnly: boolean } {
  const namesOnly = process.argv.includes("--names-only");
  const positional = process.argv.slice(2).filter((a) => a !== "--names-only");
  const folderId = positional[0]?.trim() || process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || undefined;
  return { folderId, namesOnly };
}

async function main(): Promise<void> {
  const { folderId, namesOnly } = parseArgs();
  if (!folderId) {
    console.error(
      "Укажите ID папки: GOOGLE_DRIVE_FOLDER_ID в .env или аргументом:\n" +
        "  npx ts-node scripts/list-google-drive-files.ts <folderId>",
    );
    process.exit(1);
  }

  const files = await listFilesInFolder(folderId);
  if (namesOnly) {
    for (const f of files) console.log(f.name);
    console.error(`# всего: ${files.length}`);
    return;
  }

  console.log(
    JSON.stringify(
      { folderId, total: files.length, files },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
