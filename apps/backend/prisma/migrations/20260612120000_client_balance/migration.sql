-- CreateEnum
CREATE TYPE "BalanceHolderKind" AS ENUM ('CONTACT', 'COMPANY');

-- CreateEnum
CREATE TYPE "ClientBalanceTransactionType" AS ENUM ('CREDIT_FROM_RETURN', 'APPLY_TO_ORDER', 'REFUND_OUT', 'MANUAL_ADJUST');

-- CreateEnum
CREATE TYPE "ReturnSettlementType" AS ENUM ('CREDIT', 'REFUND', 'SPLIT');

-- AlterEnum
ALTER TYPE "PaymentSourceType" ADD VALUE 'CREDIT';

-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN     "settlementType" "ReturnSettlementType",
ADD COLUMN     "creditAmount" DOUBLE PRECISION,
ADD COLUMN     "refundAmount" DOUBLE PRECISION,
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settledByUserId" TEXT;

-- CreateTable
CREATE TABLE "ClientBalance" (
    "id" TEXT NOT NULL,
    "holderKind" "BalanceHolderKind" NOT NULL,
    "holderId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,

    CONSTRAINT "ClientBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientBalanceTransaction" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "type" "ClientBalanceTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "orderId" TEXT,
    "orderReturnId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientBalanceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientBalance_holderKind_holderId_currency_key" ON "ClientBalance"("holderKind", "holderId", "currency");

-- CreateIndex
CREATE INDEX "ClientBalance_contactId_idx" ON "ClientBalance"("contactId");

-- CreateIndex
CREATE INDEX "ClientBalance_companyId_idx" ON "ClientBalance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientBalanceTransaction_paymentId_key" ON "ClientBalanceTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "ClientBalanceTransaction_balanceId_idx" ON "ClientBalanceTransaction"("balanceId");

-- CreateIndex
CREATE INDEX "ClientBalanceTransaction_orderId_idx" ON "ClientBalanceTransaction"("orderId");

-- CreateIndex
CREATE INDEX "ClientBalanceTransaction_orderReturnId_idx" ON "ClientBalanceTransaction"("orderReturnId");

-- CreateIndex
CREATE INDEX "ClientBalanceTransaction_contactId_idx" ON "ClientBalanceTransaction"("contactId");

-- CreateIndex
CREATE INDEX "ClientBalanceTransaction_companyId_idx" ON "ClientBalanceTransaction"("companyId");

-- CreateIndex
CREATE INDEX "ClientBalanceTransaction_createdAt_idx" ON "ClientBalanceTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "OrderReturn_settledByUserId_idx" ON "OrderReturn"("settledByUserId");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_settledByUserId_fkey" FOREIGN KEY ("settledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalance" ADD CONSTRAINT "ClientBalance_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalance" ADD CONSTRAINT "ClientBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "ClientBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_orderReturnId_fkey" FOREIGN KEY ("orderReturnId") REFERENCES "OrderReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBalanceTransaction" ADD CONSTRAINT "ClientBalanceTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
