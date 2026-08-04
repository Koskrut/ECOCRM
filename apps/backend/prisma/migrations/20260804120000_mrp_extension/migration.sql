-- CreateEnum
CREATE TYPE "PlanningRunMode" AS ENUM ('FULL', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PlanningRunLineType" AS ENUM ('PRODUCTION', 'PACK', 'SEMI_REORDER', 'CRITICAL', 'CAN_PACK');

-- CreateTable
CREATE TABLE "PlanningProductParams" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "productionLeadDays" INTEGER NOT NULL DEFAULT 90,
    "packLeadDays" INTEGER,
    "isPlanned" BOOLEAN NOT NULL DEFAULT true,
    "monthlyForecastOverride" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningProductParams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningRun" (
    "id" TEXT NOT NULL,
    "mode" "PlanningRunMode" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coverMonths" INTEGER NOT NULL,
    "monthlyPartsQuota" INTEGER NOT NULL,
    "velocityLookbackMonths" INTEGER NOT NULL,
    "snapshotId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningRunLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineType" "PlanningRunLineType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "suggestedLaunchQty" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "monthBucket" INTEGER,
    "coverDays" DOUBLE PRECISION,
    "reason" TEXT,
    "details" JSONB,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningProductParams_productId_key" ON "PlanningProductParams"("productId");

-- CreateIndex
CREATE INDEX "PlanningProductParams_isPlanned_idx" ON "PlanningProductParams"("isPlanned");

-- CreateIndex
CREATE INDEX "PlanningRun_computedAt_idx" ON "PlanningRun"("computedAt");

-- CreateIndex
CREATE INDEX "PlanningRun_mode_computedAt_idx" ON "PlanningRun"("mode", "computedAt");

-- CreateIndex
CREATE INDEX "PlanningRunLine_runId_lineType_idx" ON "PlanningRunLine"("runId", "lineType");

-- CreateIndex
CREATE INDEX "PlanningRunLine_runId_monthBucket_idx" ON "PlanningRunLine"("runId", "monthBucket");

-- CreateIndex
CREATE INDEX "PlanningRunLine_productId_idx" ON "PlanningRunLine"("productId");

-- CreateIndex
CREATE INDEX "PlanningRunLine_lineType_priority_idx" ON "PlanningRunLine"("lineType", "priority");

-- AddForeignKey
ALTER TABLE "PlanningProductParams" ADD CONSTRAINT "PlanningProductParams_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRunLine" ADD CONSTRAINT "PlanningRunLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlanningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRunLine" ADD CONSTRAINT "PlanningRunLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
