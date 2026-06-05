-- AlterEnum
ALTER TYPE "BankProvider" ADD VALUE 'UPC';

-- CreateEnum
CREATE TYPE "BankTransactionMatchStatus" AS ENUM ('UNMATCHED', 'NEEDS_REVIEW', 'AUTO_MATCHED', 'MATCHED');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "matchStatus" "BankTransactionMatchStatus" NOT NULL DEFAULT 'UNMATCHED';
ALTER TABLE "BankTransaction" ADD COLUMN "matchScore" INTEGER;
ALTER TABLE "BankTransaction" ADD COLUMN "suggestedOrderId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_matchStatus_idx" ON "BankTransaction"("matchStatus");

-- CreateTable
CREATE TABLE "UpcConsent" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpcConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UpcConsent_bankAccountId_key" ON "UpcConsent"("bankAccountId");
CREATE INDEX "UpcConsent_consentId_idx" ON "UpcConsent"("consentId");
CREATE INDEX "UpcConsent_status_idx" ON "UpcConsent"("status");

-- AddForeignKey
ALTER TABLE "UpcConsent" ADD CONSTRAINT "UpcConsent_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
