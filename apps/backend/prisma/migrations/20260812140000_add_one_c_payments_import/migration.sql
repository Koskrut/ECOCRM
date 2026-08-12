-- AlterEnum
ALTER TYPE "PaymentSourceType" ADD VALUE 'ONE_C';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "oneCImportKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_oneCImportKey_key" ON "Payment"("oneCImportKey");
