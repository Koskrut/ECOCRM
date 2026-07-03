-- AlterTable
ALTER TABLE "TelegramInboundUpdate" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "TelegramInboundUpdate" ADD COLUMN IF NOT EXISTS "processingError" TEXT;

-- Backfill: existing rows were created only after successful processing under the
-- previous delete-on-error scheme, so treat them as processed.
UPDATE "TelegramInboundUpdate" SET "processedAt" = "createdAt" WHERE "processedAt" IS NULL;
