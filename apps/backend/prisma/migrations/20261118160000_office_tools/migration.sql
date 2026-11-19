-- AlterEnum
ALTER TYPE "PaymentSourceType" ADD VALUE 'OFFICE_TOOLS';

-- AlterEnum
ALTER TYPE "InventorySnapshotSource" ADD VALUE 'OFFICE_TOOLS';

-- CreateTable
CREATE TABLE "OfficeToolsLink" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalCode" TEXT,
    "meta" JSONB,
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeToolsLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeToolsStockSerial" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "prodId" INTEGER NOT NULL,
    "stockId" INTEGER NOT NULL,
    "serial" TEXT NOT NULL DEFAULT '',
    "serialKey" TEXT NOT NULL DEFAULT '',
    "qty" INTEGER NOT NULL DEFAULT 0,
    "article" TEXT,
    "prodName" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeToolsStockSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeToolsReceipt" (
    "id" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "compId" INTEGER,
    "code" TEXT,
    "contactId" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "docDate" TIMESTAMP(3),
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "managerName" TEXT,
    "compName" TEXT,
    "raw" JSONB,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeToolsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeToolsLink_externalCode_idx" ON "OfficeToolsLink"("externalCode");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeToolsLink_entityType_entityId_key" ON "OfficeToolsLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeToolsLink_entityType_externalId_key" ON "OfficeToolsLink"("entityType", "externalId");

-- CreateIndex
CREATE INDEX "OfficeToolsStockSerial_productId_idx" ON "OfficeToolsStockSerial"("productId");

-- CreateIndex
CREATE INDEX "OfficeToolsStockSerial_warehouseId_idx" ON "OfficeToolsStockSerial"("warehouseId");

-- CreateIndex
CREATE INDEX "OfficeToolsStockSerial_serialKey_idx" ON "OfficeToolsStockSerial"("serialKey");

-- CreateIndex
CREATE INDEX "OfficeToolsStockSerial_prodId_idx" ON "OfficeToolsStockSerial"("prodId");

-- CreateIndex
CREATE INDEX "OfficeToolsStockSerial_stockId_idx" ON "OfficeToolsStockSerial"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeToolsStockSerial_productId_warehouseId_serialKey_key" ON "OfficeToolsStockSerial"("productId", "warehouseId", "serialKey");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeToolsReceipt_importKey_key" ON "OfficeToolsReceipt"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeToolsReceipt_paymentId_key" ON "OfficeToolsReceipt"("paymentId");

-- CreateIndex
CREATE INDEX "OfficeToolsReceipt_contactId_idx" ON "OfficeToolsReceipt"("contactId");

-- CreateIndex
CREATE INDEX "OfficeToolsReceipt_orderId_idx" ON "OfficeToolsReceipt"("orderId");

-- CreateIndex
CREATE INDEX "OfficeToolsReceipt_status_idx" ON "OfficeToolsReceipt"("status");

-- CreateIndex
CREATE INDEX "OfficeToolsReceipt_docDate_idx" ON "OfficeToolsReceipt"("docDate");

-- AddForeignKey
ALTER TABLE "OfficeToolsStockSerial" ADD CONSTRAINT "OfficeToolsStockSerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeToolsStockSerial" ADD CONSTRAINT "OfficeToolsStockSerial_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
