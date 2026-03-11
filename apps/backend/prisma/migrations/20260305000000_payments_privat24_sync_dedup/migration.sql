-- BankAccount: add lastBookedAt, syncWindowDays
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "lastBookedAt" TIMESTAMP(3);
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "syncWindowDays" INTEGER NOT NULL DEFAULT 2;

-- BankTransaction: add hash, importedAt, dedupKey (backfill from externalId)
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "hash" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "dedupKey" TEXT;

UPDATE "BankTransaction" SET "dedupKey" = "externalId" WHERE "dedupKey" IS NULL;

ALTER TABLE "BankTransaction" ALTER COLUMN "dedupKey" SET NOT NULL;

-- Make externalId nullable
ALTER TABLE "BankTransaction" ALTER COLUMN "externalId" DROP NOT NULL;

-- Drop old unique, add new unique on (bankAccountId, dedupKey)
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_bankAccountId_externalId_key";
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_dedupKey_key" ON "BankTransaction"("bankAccountId", "dedupKey");

-- Index on bookedAt if not exists
CREATE INDEX IF NOT EXISTS "BankTransaction_bookedAt_idx" ON "BankTransaction"("bookedAt");

-- Payment: unique on bankTransactionId (one payment per bank transaction)
CREATE UNIQUE INDEX "Payment_bankTransactionId_key" ON "Payment"("bankTransactionId") WHERE "bankTransactionId" IS NOT NULL;
