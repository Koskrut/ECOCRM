-- AlterEnum
ALTER TYPE "PaymentSourceType" ADD VALUE IF NOT EXISTS 'CREDIT_TRANSFER';

-- AlterTable Order: visible transferable overpayment
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "creditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable Payment: audit link for credit transfers
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "transferGroupId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "linkedOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_transferGroupId_idx" ON "Payment"("transferGroupId");
CREATE INDEX IF NOT EXISTS "Payment_linkedOrderId_idx" ON "Payment"("linkedOrderId");

-- Backfill credit from existing overpayments (paid > effective total after returns)
UPDATE "Order"
SET "creditAmount" = GREATEST(
  0,
  "paidAmount" - GREATEST(0, "totalAmount" - COALESCE("returnAdjustmentAmount", 0))
)
WHERE "paidAmount" > GREATEST(0, "totalAmount" - COALESCE("returnAdjustmentAmount", 0));
