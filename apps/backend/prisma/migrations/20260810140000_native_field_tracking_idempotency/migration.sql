-- Native field tracking: sample idempotency + telemetry split (RFC native-field-tracking)

-- CreateEnum
CREATE TYPE "FieldTrackingHealthState" AS ENUM (
  'TRACKING_HEALTHY',
  'NETWORK_DEGRADED',
  'LOCATION_STALE',
  'SERVICE_DEAD',
  'RECOVERY_IN_PROGRESS',
  'RECOVERY_FAILED'
);

-- CreateEnum
CREATE TYPE "FieldLocationSampleSource" AS ENUM ('EXPO', 'NATIVE_ANDROID');

-- AlterTable UserActivitySession: split app vs native vs GPS vs server accept telemetry
ALTER TABLE "UserActivitySession"
  ADD COLUMN "appLastSeenAt" TIMESTAMP(3),
  ADD COLUMN "nativeLastSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastGpsCapturedAt" TIMESTAMP(3),
  ADD COLUMN "lastServerAcceptAt" TIMESTAMP(3),
  ADD COLUMN "trackingHealthState" "FieldTrackingHealthState";

-- Backfill appLastSeenAt from legacy lastSeenAt
UPDATE "UserActivitySession" SET "appLastSeenAt" = "lastSeenAt" WHERE "appLastSeenAt" IS NULL;

-- AlterTable FieldLocationSample: idempotency keys + source tag
ALTER TABLE "FieldLocationSample"
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "sampleId" TEXT,
  ADD COLUMN "deviceId" TEXT,
  ADD COLUMN "source" "FieldLocationSampleSource";

-- Backfill ownerId from shift
UPDATE "FieldLocationSample" AS s
SET "ownerId" = sh."ownerId"
FROM "FieldShift" AS sh
WHERE s."shiftId" = sh."id" AND s."ownerId" IS NULL;

ALTER TABLE "FieldLocationSample" ALTER COLUMN "ownerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "FieldLocationSample_ownerId_sampleId_idx" ON "FieldLocationSample"("ownerId", "sampleId");

-- Owner-scoped idempotency: same sampleId from same rep cannot create two rows
CREATE UNIQUE INDEX "FieldLocationSample_ownerId_sampleId_key"
  ON "FieldLocationSample"("ownerId", "sampleId")
  WHERE "sampleId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "FieldLocationSample"
  ADD CONSTRAINT "FieldLocationSample_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
