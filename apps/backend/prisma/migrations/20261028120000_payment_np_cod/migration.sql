-- Nova Poshta cash-on-delivery payment source + TTN idempotency key
ALTER TYPE "PaymentSourceType" ADD VALUE IF NOT EXISTS 'NP_COD';

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "npTtnDocumentNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_npTtnDocumentNumber_key" ON "Payment"("npTtnDocumentNumber");
