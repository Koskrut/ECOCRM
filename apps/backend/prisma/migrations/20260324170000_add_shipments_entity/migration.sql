-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELED');

-- AlterTable
ALTER TABLE "OrderTtn"
ADD COLUMN     "shipmentId" TEXT,
ALTER COLUMN   "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "contactId" TEXT,
    "carrier" "Carrier" NOT NULL DEFAULT 'NOVA_POSHTA',
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderTtn_shipmentId_idx" ON "OrderTtn"("shipmentId");
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");
CREATE INDEX "Shipment_contactId_idx" ON "Shipment"("contactId");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
CREATE INDEX "Shipment_carrier_idx" ON "Shipment"("carrier");
CREATE INDEX "ShipmentItem_shipmentId_idx" ON "ShipmentItem"("shipmentId");
CREATE INDEX "ShipmentItem_orderItemId_idx" ON "ShipmentItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_orderItemId_key" ON "ShipmentItem"("shipmentId", "orderItemId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderTtn" ADD CONSTRAINT "OrderTtn_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one shipment per order that already has TTNs
INSERT INTO "Shipment" ("id", "orderId", "contactId", "carrier", "status", "recipientSnapshot", "createdAt", "updatedAt")
SELECT
  ('shp_' || substr(md5(random()::text || clock_timestamp()::text || o.id), 1, 24)) AS "id",
  o.id AS "orderId",
  o."contactId" AS "contactId",
  'NOVA_POSHTA'::"Carrier" AS "carrier",
  'DRAFT'::"ShipmentStatus" AS "status",
  (o."deliveryData"->'novaPoshta') AS "recipientSnapshot",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM "Order" o
WHERE EXISTS (
  SELECT 1 FROM "OrderTtn" t WHERE t."orderId" = o.id
);

-- Bind existing TTNs to first created shipment of the same order
WITH first_shipment AS (
  SELECT DISTINCT ON (s."orderId")
    s."orderId",
    s."id" AS "shipmentId"
  FROM "Shipment" s
  ORDER BY s."orderId", s."createdAt" ASC
)
UPDATE "OrderTtn" t
SET "shipmentId" = fs."shipmentId"
FROM first_shipment fs
WHERE t."orderId" = fs."orderId"
  AND t."shipmentId" IS NULL;
