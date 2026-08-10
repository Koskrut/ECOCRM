-- Prevent duplicate manual/cash payments (double-click, race).
CREATE UNIQUE INDEX "Payment_cash_completed_dedup_key"
  ON "Payment"("orderId", "amount", "currency", "paidAt")
  WHERE "status" = 'COMPLETED' AND "bankTransactionId" IS NULL;

-- Speed up Privat24 re-import merge by externalId.
CREATE INDEX IF NOT EXISTS "BankTransaction_bankAccountId_externalId_idx"
  ON "BankTransaction"("bankAccountId", "externalId")
  WHERE "externalId" IS NOT NULL;
