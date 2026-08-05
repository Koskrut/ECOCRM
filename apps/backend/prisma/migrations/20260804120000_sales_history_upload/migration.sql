-- CreateEnum
CREATE TYPE "SalesHistoryUploadStatus" AS ENUM ('STAGED', 'POSTED', 'VOID');

-- CreateTable
CREATE TABLE "SalesHistoryUpload" (
    "id" TEXT NOT NULL,
    "status" "SalesHistoryUploadStatus" NOT NULL DEFAULT 'STAGED',
    "note" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesHistoryUpload_pkey" PRIMARY KEY ("id")
);

-- Add columns to SalesHistoryLine (nullable uploadId first for backfill)
ALTER TABLE "SalesHistoryLine" ADD COLUMN "uploadId" TEXT;
ALTER TABLE "SalesHistoryLine" ADD COLUMN "yearMonth" TEXT;

-- Backfill: synthetic POSTED upload for legacy EXCEL_IMPORT rows
DO $$
DECLARE
  legacy_count INTEGER;
  admin_id TEXT;
  upload_id TEXT;
BEGIN
  SELECT COUNT(*) INTO legacy_count FROM "SalesHistoryLine";
  IF legacy_count > 0 THEN
    SELECT "id" INTO admin_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;
    IF admin_id IS NOT NULL THEN
      upload_id := 'legacy-sales-upload-' || substr(md5(random()::text), 1, 12);
      INSERT INTO "SalesHistoryUpload" (
        "id", "status", "note", "importedAt", "importedById", "postedAt", "postedById", "createdAt", "updatedAt"
      ) VALUES (
        upload_id,
        'POSTED',
        'Migrated from legacy EXCEL_IMPORT sales lines',
        CURRENT_TIMESTAMP,
        admin_id,
        CURRENT_TIMESTAMP,
        admin_id,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );
      UPDATE "SalesHistoryLine"
      SET
        "uploadId" = upload_id,
        "yearMonth" = to_char("soldAt" AT TIME ZONE 'UTC', 'YYYY-MM')
      WHERE "uploadId" IS NULL;
    END IF;
  END IF;
END $$;

-- Delete orphan lines without upload (no admin user to attach)
DELETE FROM "SalesHistoryLine" WHERE "uploadId" IS NULL;

-- Enforce NOT NULL + FK
ALTER TABLE "SalesHistoryLine" ALTER COLUMN "uploadId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "SalesHistoryUpload_status_importedAt_idx" ON "SalesHistoryUpload"("status", "importedAt");
CREATE INDEX "SalesHistoryUpload_importedById_idx" ON "SalesHistoryUpload"("importedById");
CREATE INDEX "SalesHistoryLine_uploadId_idx" ON "SalesHistoryLine"("uploadId");
CREATE INDEX "SalesHistoryLine_yearMonth_idx" ON "SalesHistoryLine"("yearMonth");

-- AddForeignKey
ALTER TABLE "SalesHistoryUpload" ADD CONSTRAINT "SalesHistoryUpload_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesHistoryUpload" ADD CONSTRAINT "SalesHistoryUpload_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesHistoryLine" ADD CONSTRAINT "SalesHistoryLine_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "SalesHistoryUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
