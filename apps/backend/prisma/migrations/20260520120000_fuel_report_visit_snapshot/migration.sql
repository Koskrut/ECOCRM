-- AlterTable
ALTER TABLE "FuelDayReport" ADD COLUMN "compensationKm" DOUBLE PRECISION,
ADD COLUMN "metricsSource" TEXT,
ADD COLUMN "visitCount" INTEGER,
ADD COLUMN "calculationSnapshot" JSONB,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "managerNote" TEXT;

-- CreateIndex
CREATE INDEX "FuelDayReport_ownerId_date_compensationStatus_idx" ON "FuelDayReport"("ownerId", "date", "compensationStatus");
