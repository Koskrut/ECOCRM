-- AlterTable
ALTER TABLE "ReturnPackage" ADD COLUMN "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN "warehouseId" TEXT;

-- CreateIndex
CREATE INDEX "ReturnPackage_warehouseId_idx" ON "ReturnPackage"("warehouseId");

-- CreateIndex
CREATE INDEX "OrderReturn_warehouseId_idx" ON "OrderReturn"("warehouseId");

-- AddForeignKey
ALTER TABLE "ReturnPackage" ADD CONSTRAINT "ReturnPackage_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
