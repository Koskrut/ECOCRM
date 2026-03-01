-- AlterTable
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amountUsd" DECIMAL(18,2);
