-- CreateEnum
CREATE TYPE "OrderStage" AS ENUM ('NEW', 'CONFIRMED', 'AWAITING_PAYMENT', 'AWAITING_STOCK', 'READY_TO_SHIP', 'SHIPPED', 'AWAITING_RECEIPT', 'RECEIVED', 'COMPLETED', 'CANCELED', 'REFUSED', 'RETURN_IN_PROGRESS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_SHIPPED', 'SHIPPED', 'IN_TRANSIT', 'AWAITING_RECEIPT', 'RECEIVED', 'REFUSED', 'RETURN_TO_WAREHOUSE');

-- CreateEnum
CREATE TYPE "OrderFinancialStatus" AS ENUM ('INVOICE_PENDING', 'AWAITING_PAYMENT', 'DUE_SOON', 'OVERDUE', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'IN_TRANSIT_BACK', 'RECEIVED_BY_WAREHOUSE', 'INSPECTION', 'REFUND_OR_ADJUSTMENT', 'CLOSED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryStatus" "DeliveryStatus",
ADD COLUMN     "financialStatus" "OrderFinancialStatus",
ADD COLUMN     "orderStage" "OrderStage",
ADD COLUMN     "paymentDueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReturnItem" (
    "id" TEXT NOT NULL,
    "orderReturnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qtyReturned" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderReturn_orderId_idx" ON "OrderReturn"("orderId");

-- CreateIndex
CREATE INDEX "OrderReturn_status_idx" ON "OrderReturn"("status");

-- CreateIndex
CREATE INDEX "OrderReturnItem_orderReturnId_idx" ON "OrderReturnItem"("orderReturnId");

-- CreateIndex
CREATE INDEX "OrderReturnItem_orderItemId_idx" ON "OrderReturnItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReturnItem_orderReturnId_orderItemId_key" ON "OrderReturnItem"("orderReturnId", "orderItemId");

-- CreateIndex
CREATE INDEX "Order_orderStage_idx" ON "Order"("orderStage");

-- CreateIndex
CREATE INDEX "Order_financialStatus_idx" ON "Order"("financialStatus");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_orderReturnId_fkey" FOREIGN KEY ("orderReturnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: set orderStage, deliveryStatus, financialStatus from legacy status (conservative)
UPDATE "Order"
SET
  "orderStage" = CASE "status"
    WHEN 'NEW' THEN 'NEW'::"OrderStage"
    WHEN 'IN_WORK' THEN 'CONFIRMED'::"OrderStage"
    WHEN 'READY_TO_SHIP' THEN 'READY_TO_SHIP'::"OrderStage"
    WHEN 'SHIPPED' THEN 'SHIPPED'::"OrderStage"
    WHEN 'CONTROL_PAYMENT' THEN 'RECEIVED'::"OrderStage"
    WHEN 'SUCCESS' THEN 'COMPLETED'::"OrderStage"
    WHEN 'RETURNING' THEN 'RETURN_IN_PROGRESS'::"OrderStage"
    WHEN 'CANCELED' THEN 'CANCELED'::"OrderStage"
    ELSE 'NEW'::"OrderStage"
  END,
  "deliveryStatus" = CASE "status"
    WHEN 'NEW' THEN 'NOT_SHIPPED'::"DeliveryStatus"
    WHEN 'IN_WORK' THEN 'NOT_SHIPPED'::"DeliveryStatus"
    WHEN 'READY_TO_SHIP' THEN 'NOT_SHIPPED'::"DeliveryStatus"
    WHEN 'SHIPPED' THEN 'IN_TRANSIT'::"DeliveryStatus"
    WHEN 'CONTROL_PAYMENT' THEN 'RECEIVED'::"DeliveryStatus"
    WHEN 'SUCCESS' THEN 'RECEIVED'::"DeliveryStatus"
    WHEN 'RETURNING' THEN 'RETURN_TO_WAREHOUSE'::"DeliveryStatus"
    WHEN 'CANCELED' THEN 'NOT_SHIPPED'::"DeliveryStatus"
    ELSE 'NOT_SHIPPED'::"DeliveryStatus"
  END,
  "financialStatus" = CASE
    WHEN "status" IN ('SUCCESS', 'CANCELED', 'RETURNING') THEN 'CLOSED'::"OrderFinancialStatus"
    WHEN COALESCE("debtAmount", 0) <= 0 OR COALESCE("paidAmount", 0) >= COALESCE("totalAmount", 0) THEN 'CLOSED'::"OrderFinancialStatus"
    ELSE 'AWAITING_PAYMENT'::"OrderFinancialStatus"
  END;
