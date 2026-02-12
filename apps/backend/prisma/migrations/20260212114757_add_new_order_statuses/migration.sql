-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'IN_WORK';
ALTER TYPE "OrderStatus" ADD VALUE 'READY_TO_SHIP';
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_CONTROL';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNING';
ALTER TYPE "OrderStatus" ADD VALUE 'SUCCESS';

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_toStatus_idx" ON "OrderStatusHistory"("toStatus");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_createdAt_idx" ON "OrderStatusHistory"("createdAt");

-- CreateIndex
CREATE INDEX "OrderTtn_statusCode_idx" ON "OrderTtn"("statusCode");

-- CreateIndex
CREATE INDEX "OrderTtn_updatedAt_idx" ON "OrderTtn"("updatedAt");
