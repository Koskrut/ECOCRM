-- Planning: forecast cache, sales history, packing lists, factory orders

CREATE TYPE "PackingListStatus" AS ENUM ('DRAFT', 'APPROVED', 'DONE');
CREATE TYPE "FactoryOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED');
CREATE TYPE "PlanningDemandMix" AS ENUM ('HARD_PLUS_FORECAST_BEYOND_COVERED', 'MAX_FORECAST_HARD');

CREATE TABLE "KitDemandForecast" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitDemandForecast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesHistoryLine" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "skuRaw" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "qty" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EXCEL_IMPORT',
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesHistoryLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "status" "PackingListStatus" NOT NULL DEFAULT 'DRAFT',
    "capacityUsed" INTEGER NOT NULL DEFAULT 0,
    "capacityLimit" INTEGER NOT NULL,
    "snapshotId" TEXT,
    "note" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackingListLine" (
    "id" TEXT NOT NULL,
    "packingListId" TEXT NOT NULL,
    "kitProductId" TEXT NOT NULL,
    "qtySuggested" INTEGER NOT NULL,
    "qtyApproved" INTEGER NOT NULL,
    "maxFromParts" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "hardNeed" INTEGER NOT NULL DEFAULT 0,
    "forecastNeed" INTEGER NOT NULL DEFAULT 0,
    "stockKits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingListLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FactoryOrder" (
    "id" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FactoryOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoryOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FactoryOrderLine" (
    "id" TEXT NOT NULL,
    "factoryOrderId" TEXT NOT NULL,
    "partProductId" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoryOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KitDemandForecast_productId_horizonDays_key" ON "KitDemandForecast"("productId", "horizonDays");
CREATE INDEX "KitDemandForecast_horizonDays_idx" ON "KitDemandForecast"("horizonDays");
CREATE INDEX "KitDemandForecast_computedAt_idx" ON "KitDemandForecast"("computedAt");

CREATE INDEX "SalesHistoryLine_productId_soldAt_idx" ON "SalesHistoryLine"("productId", "soldAt");
CREATE INDEX "SalesHistoryLine_skuRaw_idx" ON "SalesHistoryLine"("skuRaw");
CREATE INDEX "SalesHistoryLine_soldAt_idx" ON "SalesHistoryLine"("soldAt");
CREATE INDEX "SalesHistoryLine_importBatchId_idx" ON "SalesHistoryLine"("importBatchId");

CREATE INDEX "PackingList_status_cycleStart_idx" ON "PackingList"("status", "cycleStart");
CREATE INDEX "PackingList_snapshotId_idx" ON "PackingList"("snapshotId");

CREATE UNIQUE INDEX "PackingListLine_packingListId_kitProductId_key" ON "PackingListLine"("packingListId", "kitProductId");
CREATE INDEX "PackingListLine_kitProductId_idx" ON "PackingListLine"("kitProductId");

CREATE INDEX "FactoryOrder_status_dueAt_idx" ON "FactoryOrder"("status", "dueAt");
CREATE INDEX "FactoryOrder_orderedAt_idx" ON "FactoryOrder"("orderedAt");

CREATE UNIQUE INDEX "FactoryOrderLine_factoryOrderId_partProductId_key" ON "FactoryOrderLine"("factoryOrderId", "partProductId");
CREATE INDEX "FactoryOrderLine_partProductId_idx" ON "FactoryOrderLine"("partProductId");

ALTER TABLE "KitDemandForecast" ADD CONSTRAINT "KitDemandForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesHistoryLine" ADD CONSTRAINT "SalesHistoryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "InventorySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackingListLine" ADD CONSTRAINT "PackingListLine_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackingListLine" ADD CONSTRAINT "PackingListLine_kitProductId_fkey" FOREIGN KEY ("kitProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FactoryOrderLine" ADD CONSTRAINT "FactoryOrderLine_factoryOrderId_fkey" FOREIGN KEY ("factoryOrderId") REFERENCES "FactoryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryOrderLine" ADD CONSTRAINT "FactoryOrderLine_partProductId_fkey" FOREIGN KEY ("partProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
