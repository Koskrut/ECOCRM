-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('CUSTOMER_CHANGE', 'DEFECT', 'WRONG_ITEM');

-- CreateEnum
CREATE TYPE "ReplacementMode" AS ENUM ('REPLACE_FIRST', 'RETURN_FIRST');

-- CreateEnum
CREATE TYPE "ReturnItemDisposition" AS ENUM ('PENDING', 'RESTOCK', 'QUARANTINE', 'WRITE_OFF');

-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN     "reason" "ReturnReason" NOT NULL DEFAULT 'CUSTOMER_CHANGE',
ADD COLUMN     "replacementMode" "ReplacementMode",
ADD COLUMN     "replacementOrderId" TEXT,
ADD COLUMN     "inboundDoneAt" TIMESTAMP(3),
ADD COLUMN     "outboundDoneAt" TIMESTAMP(3),
ADD COLUMN     "inboundWaivedAt" TIMESTAMP(3),
ADD COLUMN     "inboundWaiveReason" TEXT,
ADD COLUMN     "outboundWaivedAt" TIMESTAMP(3),
ADD COLUMN     "outboundWaiveReason" TEXT;

-- AlterTable
ALTER TABLE "OrderReturnItem" ADD COLUMN     "actualProductId" TEXT,
ADD COLUMN     "disposition" "ReturnItemDisposition" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "OrderReturn_replacementOrderId_idx" ON "OrderReturn"("replacementOrderId");

-- CreateIndex
CREATE INDEX "OrderReturn_reason_idx" ON "OrderReturn"("reason");

-- CreateIndex
CREATE INDEX "OrderReturnItem_actualProductId_idx" ON "OrderReturnItem"("actualProductId");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_replacementOrderId_fkey" FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_actualProductId_fkey" FOREIGN KEY ("actualProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
