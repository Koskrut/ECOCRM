-- AlterEnum
ALTER TYPE "BankTransactionMatchStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_MATCHED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PayerAliasSource" AS ENUM ('MANUAL', 'LEARNED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMatchDecision" AS ENUM ('AUTO', 'SUGGESTED', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayerAlias" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "counterpartyIban" TEXT,
    "counterpartyNameNormalized" TEXT,
    "source" "PayerAliasSource" NOT NULL DEFAULT 'LEARNED',
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentMatchAudit" (
    "id" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "paymentIds" TEXT[],
    "decision" "PaymentMatchDecision" NOT NULL,
    "reasons" JSONB,
    "score" INTEGER,
    "matchReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "PaymentMatchAudit_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "BankTransaction_counterpartyIban_idx" ON "BankTransaction"("counterpartyIban");

CREATE UNIQUE INDEX IF NOT EXISTS "PayerAlias_counterpartyIban_key" ON "PayerAlias"("counterpartyIban");
CREATE INDEX IF NOT EXISTS "PayerAlias_counterpartyIban_idx" ON "PayerAlias"("counterpartyIban");
CREATE INDEX IF NOT EXISTS "PayerAlias_counterpartyNameNormalized_idx" ON "PayerAlias"("counterpartyNameNormalized");
CREATE INDEX IF NOT EXISTS "PayerAlias_contactId_idx" ON "PayerAlias"("contactId");
CREATE INDEX IF NOT EXISTS "PayerAlias_companyId_idx" ON "PayerAlias"("companyId");

CREATE INDEX IF NOT EXISTS "PaymentMatchAudit_bankTransactionId_idx" ON "PaymentMatchAudit"("bankTransactionId");
CREATE INDEX IF NOT EXISTS "PaymentMatchAudit_createdAt_idx" ON "PaymentMatchAudit"("createdAt");

CREATE INDEX IF NOT EXISTS "Company_edrpou_idx" ON "Company"("edrpou");
CREATE INDEX IF NOT EXISTS "Company_taxId_idx" ON "Company"("taxId");

-- ForeignKeys
DO $$ BEGIN
  ALTER TABLE "PayerAlias" ADD CONSTRAINT "PayerAlias_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PayerAlias" ADD CONSTRAINT "PayerAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentMatchAudit" ADD CONSTRAINT "PaymentMatchAudit_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentMatchAudit" ADD CONSTRAINT "PaymentMatchAudit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
