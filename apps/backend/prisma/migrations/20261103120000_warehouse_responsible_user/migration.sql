-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN "responsibleUserId" TEXT;

-- CreateIndex
CREATE INDEX "Warehouse_responsibleUserId_idx" ON "Warehouse"("responsibleUserId");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
