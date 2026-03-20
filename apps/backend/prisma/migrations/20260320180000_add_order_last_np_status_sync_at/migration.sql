-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lastNpStatusSyncAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_lastNpStatusSyncAt_idx" ON "Order"("lastNpStatusSyncAt");
