-- Add code of bank account (FOP account) for 1C/Google Sheet integration.

ALTER TABLE "BankAccount"
ADD COLUMN IF NOT EXISTS "accountExternalCode" TEXT;

-- Unique, but allow multiple NULLs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'BankAccount_accountExternalCode_key'
  ) THEN
    CREATE UNIQUE INDEX "BankAccount_accountExternalCode_key" ON "BankAccount" ("accountExternalCode");
  END IF;
END $$;

