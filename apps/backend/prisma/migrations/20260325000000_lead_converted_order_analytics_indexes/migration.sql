-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "convertedOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedOrderId_key" ON "Lead"("convertedOrderId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Analytics performance (Phase 4 plan)
CREATE INDEX IF NOT EXISTS "Order_clientId_createdAt_idx" ON "Order"("clientId", "createdAt");

CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
