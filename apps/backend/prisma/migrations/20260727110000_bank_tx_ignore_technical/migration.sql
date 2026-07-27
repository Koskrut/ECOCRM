-- AlterEnum: non-client bank transaction statuses
ALTER TYPE "BankTransactionMatchStatus" ADD VALUE IF NOT EXISTS 'TECHNICAL';
ALTER TYPE "BankTransactionMatchStatus" ADD VALUE IF NOT EXISTS 'IGNORED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BankIgnoreCategory" AS ENUM (
    'BANK_FEE',
    'TAX',
    'OWN_TRANSFER',
    'OWN_COMPANY',
    'CASH_WITHDRAWAL',
    'OTHER_EXPENSE',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BankIgnoreSource" AS ENUM ('AUTO', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "ignoreCategory" "BankIgnoreCategory";
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "ignoreSource" "BankIgnoreSource";
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "ignoredAt" TIMESTAMP(3);
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "ignoredByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "BankTransaction_ignoreCategory_idx" ON "BankTransaction"("ignoreCategory");

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_ignoredByUserId_fkey"
    FOREIGN KEY ("ignoredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
