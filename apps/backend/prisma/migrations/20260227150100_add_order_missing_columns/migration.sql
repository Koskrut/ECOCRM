-- Add any remaining Order columns that might be missing (idempotent)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
CREATE INDEX IF NOT EXISTS "Order_contactId_idx" ON "Order"("contactId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_contactId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'NOVA_POSHTA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('FOP', 'CASH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryData" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryMethod" "DeliveryMethod";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";
