-- Production planning: BOM, 1C inventory snapshots, WIP, reservations, weekly plan items.
-- Fixes runtime errors when Prisma client expects columns/tables that were only in schema.prisma.

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('KIT', 'PART', 'OTHER');

-- CreateEnum
CREATE TYPE "InventorySnapshotSource" AS ENUM ('MANUAL_PASTE', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "InventorySnapshotStatus" AS ENUM ('STAGED', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "ReservationHardness" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProductionStageCode" AS ENUM ('MECH', 'DEGREASE', 'QC', 'PACK', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PlanningItemType" AS ENUM ('QC_QUEUE', 'PACK_QUEUE', 'LAUNCH_LIST');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "Product_kind_idx" ON "Product"("kind");

-- CreateTable
CREATE TABLE "KitBom" (
    "id" TEXT NOT NULL,
    "kitProductId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitBomLine" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "qtyPerKit" DECIMAL(18,4) NOT NULL,
    "scrapPct" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "source" "InventorySnapshotSource" NOT NULL DEFAULT 'FILE_UPLOAD',
    "status" "InventorySnapshotStatus" NOT NULL DEFAULT 'STAGED',
    "note" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySnapshotLine" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "productId" TEXT,
    "skuRaw" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "warehouseRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySnapshotLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStage" (
    "id" TEXT NOT NULL,
    "code" "ProductionStageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTimeNorm" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "productId" TEXT,
    "expectedDurationHours" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageTimeNorm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "qtyPlanned" INTEGER NOT NULL,
    "qtyGood" INTEGER NOT NULL DEFAULT 0,
    "qtyScrap" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductionBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStageId" TEXT,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WipMovement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "qtyInStage" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WipMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReservation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "qty" INTEGER NOT NULL,
    "hardness" "ReservationHardness" NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "orderId" TEXT,
    "leadId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlanItem" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "type" "PlanningItemType" NOT NULL,
    "batchId" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "qty" INTEGER,
    "title" TEXT NOT NULL,
    "details" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitBom_kitProductId_revision_key" ON "KitBom"("kitProductId", "revision");

-- CreateIndex
CREATE INDEX "KitBom_kitProductId_idx" ON "KitBom"("kitProductId");

-- CreateIndex
CREATE INDEX "KitBom_kitProductId_isActive_idx" ON "KitBom"("kitProductId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "KitBomLine_bomId_componentProductId_key" ON "KitBomLine"("bomId", "componentProductId");

-- CreateIndex
CREATE INDEX "KitBomLine_bomId_idx" ON "KitBomLine"("bomId");

-- CreateIndex
CREATE INDEX "KitBomLine_componentProductId_idx" ON "KitBomLine"("componentProductId");

-- CreateIndex
CREATE INDEX "InventorySnapshot_status_importedAt_idx" ON "InventorySnapshot"("status", "importedAt");

-- CreateIndex
CREATE INDEX "InventorySnapshot_importedById_idx" ON "InventorySnapshot"("importedById");

-- CreateIndex
CREATE INDEX "InventorySnapshotLine_snapshotId_idx" ON "InventorySnapshotLine"("snapshotId");

-- CreateIndex
CREATE INDEX "InventorySnapshotLine_warehouseId_idx" ON "InventorySnapshotLine"("warehouseId");

-- CreateIndex
CREATE INDEX "InventorySnapshotLine_productId_idx" ON "InventorySnapshotLine"("productId");

-- CreateIndex
CREATE INDEX "InventorySnapshotLine_skuRaw_idx" ON "InventorySnapshotLine"("skuRaw");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStage_code_key" ON "ProductionStage"("code");

-- CreateIndex
CREATE INDEX "ProductionStage_sortOrder_idx" ON "ProductionStage"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StageTimeNorm_stageId_productId_key" ON "StageTimeNorm"("stageId", "productId");

-- CreateIndex
CREATE INDEX "StageTimeNorm_stageId_idx" ON "StageTimeNorm"("stageId");

-- CreateIndex
CREATE INDEX "StageTimeNorm_productId_idx" ON "StageTimeNorm"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_code_key" ON "ProductionBatch"("code");

-- CreateIndex
CREATE INDEX "ProductionBatch_productId_idx" ON "ProductionBatch"("productId");

-- CreateIndex
CREATE INDEX "ProductionBatch_orderId_idx" ON "ProductionBatch"("orderId");

-- CreateIndex
CREATE INDEX "ProductionBatch_status_dueAt_idx" ON "ProductionBatch"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ProductionBatch_currentStageId_idx" ON "ProductionBatch"("currentStageId");

-- CreateIndex
CREATE INDEX "WipMovement_batchId_isCurrent_idx" ON "WipMovement"("batchId", "isCurrent");

-- CreateIndex
CREATE INDEX "WipMovement_stageId_isCurrent_idx" ON "WipMovement"("stageId", "isCurrent");

-- CreateIndex
CREATE INDEX "WipMovement_enteredAt_idx" ON "WipMovement"("enteredAt");

-- CreateIndex
CREATE INDEX "MaterialReservation_productId_status_idx" ON "MaterialReservation"("productId", "status");

-- CreateIndex
CREATE INDEX "MaterialReservation_warehouseId_status_idx" ON "MaterialReservation"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "MaterialReservation_orderId_status_idx" ON "MaterialReservation"("orderId", "status");

-- CreateIndex
CREATE INDEX "MaterialReservation_leadId_status_idx" ON "MaterialReservation"("leadId", "status");

-- CreateIndex
CREATE INDEX "MaterialReservation_hardness_status_idx" ON "MaterialReservation"("hardness", "status");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_weekStart_type_idx" ON "WeeklyPlanItem"("weekStart", "type");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_batchId_idx" ON "WeeklyPlanItem"("batchId");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_productId_idx" ON "WeeklyPlanItem"("productId");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_orderId_idx" ON "WeeklyPlanItem"("orderId");

-- AddForeignKey
ALTER TABLE "KitBom" ADD CONSTRAINT "KitBom_kitProductId_fkey" FOREIGN KEY ("kitProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitBomLine" ADD CONSTRAINT "KitBomLine_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "KitBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitBomLine" ADD CONSTRAINT "KitBomLine_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshotLine" ADD CONSTRAINT "InventorySnapshotLine_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "InventorySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshotLine" ADD CONSTRAINT "InventorySnapshotLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshotLine" ADD CONSTRAINT "InventorySnapshotLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTimeNorm" ADD CONSTRAINT "StageTimeNorm_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProductionStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTimeNorm" ADD CONSTRAINT "StageTimeNorm_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "ProductionStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WipMovement" ADD CONSTRAINT "WipMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WipMovement" ADD CONSTRAINT "WipMovement_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProductionStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReservation" ADD CONSTRAINT "MaterialReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReservation" ADD CONSTRAINT "MaterialReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReservation" ADD CONSTRAINT "MaterialReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReservation" ADD CONSTRAINT "MaterialReservation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
