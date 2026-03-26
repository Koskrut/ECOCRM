-- Canonical link: first conversion order for a lead (see Lead.convertedOrderId in schema).
-- Safe to apply once; if the column already exists in a given DB, resolve manually or mark migration applied.

ALTER TABLE "Lead" ADD COLUMN "convertedOrderId" TEXT;

CREATE UNIQUE INDEX "Lead_convertedOrderId_key" ON "Lead"("convertedOrderId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
