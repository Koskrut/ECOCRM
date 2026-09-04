-- AlterTable
ALTER TABLE "PackingListLine" ADD COLUMN "dueAt" TIMESTAMP(3);

-- Backfill from parent packing list cycleEnd
UPDATE "PackingListLine" AS pline
SET "dueAt" = plist."cycleEnd"
FROM "PackingList" AS plist
WHERE pline."packingListId" = plist."id"
  AND pline."dueAt" IS NULL;

-- CreateIndex
CREATE INDEX "PackingListLine_dueAt_idx" ON "PackingListLine"("dueAt");
