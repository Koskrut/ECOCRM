-- CreateEnum
CREATE TYPE "VisitGpsVerification" AS ENUM ('VERIFIED', 'NEARBY_WARNING', 'OUTSIDE_RADIUS', 'MANUAL_REVIEW', 'NO_FIX');

-- CreateEnum
CREATE TYPE "VisitGpsEventKind" AS ENUM ('START', 'COMPLETE');

-- CreateEnum
CREATE TYPE "FieldShiftStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "FuelCompensationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "startGpsVerification" "VisitGpsVerification",
ADD COLUMN "completeGpsVerification" "VisitGpsVerification";

-- CreateTable
CREATE TABLE "VisitGpsEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "kind" "VisitGpsEventKind" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "clientRecordedAt" TIMESTAMP(3),
    "permissionState" TEXT,
    "locationProvider" TEXT,
    "distanceToPlannedM" DOUBLE PRECISION,
    "verification" "VisitGpsVerification" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitGpsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFieldProfile" (
    "userId" TEXT NOT NULL,
    "fuelLitersPer100km" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "fuelPricePerLiter" DECIMAL(12,2),
    "vehicleLabel" TEXT,
    "usePersonalCar" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFieldProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FieldShift" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "FieldShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "plannedDistanceKm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldLocationSample" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "clientRecordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldLocationSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelDayReport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,
    "plannedKm" DOUBLE PRECISION,
    "actualKm" DOUBLE PRECISION,
    "litersEstimated" DOUBLE PRECISION,
    "amountEstimated" DECIMAL(14,2),
    "compensationStatus" "FuelCompensationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelDayReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitGpsEvent_visitId_createdAt_idx" ON "VisitGpsEvent"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "FieldShift_ownerId_date_idx" ON "FieldShift"("ownerId", "date");

-- CreateIndex
CREATE INDEX "FieldShift_ownerId_status_idx" ON "FieldShift"("ownerId", "status");

-- CreateIndex
CREATE INDEX "FieldLocationSample_shiftId_clientRecordedAt_idx" ON "FieldLocationSample"("shiftId", "clientRecordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FuelDayReport_ownerId_date_key" ON "FuelDayReport"("ownerId", "date");

-- CreateIndex
CREATE INDEX "FuelDayReport_shiftId_idx" ON "FuelDayReport"("shiftId");

-- AddForeignKey
ALTER TABLE "VisitGpsEvent" ADD CONSTRAINT "VisitGpsEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFieldProfile" ADD CONSTRAINT "UserFieldProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldShift" ADD CONSTRAINT "FieldShift_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldLocationSample" ADD CONSTRAINT "FieldLocationSample_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FieldShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDayReport" ADD CONSTRAINT "FuelDayReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDayReport" ADD CONSTRAINT "FuelDayReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FieldShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
