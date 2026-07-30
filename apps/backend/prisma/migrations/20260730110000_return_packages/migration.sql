-- CreateEnum
CREATE TYPE "ReturnPackageStatus" AS ENUM ('IN_TRANSIT_BACK', 'RECEIVED_BY_WAREHOUSE');

-- CreateTable
CREATE TABLE "ReturnPackage" (
    "id" TEXT NOT NULL,
    "ttnNumber" TEXT NOT NULL,
    "carrier" "Carrier" NOT NULL DEFAULT 'NOVA_POSHTA',
    "ttnStatusCode" TEXT,
    "ttnStatusText" TEXT,
    "ttnSyncedAt" TIMESTAMP(3),
    "contactId" TEXT,
    "note" TEXT,
    "status" "ReturnPackageStatus" NOT NULL DEFAULT 'IN_TRANSIT_BACK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnPackage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN "returnPackageId" TEXT,
ADD COLUMN "itemsPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "ReturnPackage_ttnNumber_key" ON "ReturnPackage"("ttnNumber");

-- CreateIndex
CREATE INDEX "ReturnPackage_status_idx" ON "ReturnPackage"("status");

-- CreateIndex
CREATE INDEX "ReturnPackage_contactId_idx" ON "ReturnPackage"("contactId");

-- CreateIndex
CREATE INDEX "ReturnPackage_ttnSyncedAt_idx" ON "ReturnPackage"("ttnSyncedAt");

-- CreateIndex
CREATE INDEX "OrderReturn_returnPackageId_idx" ON "OrderReturn"("returnPackageId");

-- AddForeignKey
ALTER TABLE "ReturnPackage" ADD CONSTRAINT "ReturnPackage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_returnPackageId_fkey" FOREIGN KEY ("returnPackageId") REFERENCES "ReturnPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
