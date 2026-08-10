-- Native field tracking: sample idempotency + telemetry split (RFC native-field-tracking)
-- Prod hotfix 2026-08-10: ownerId left nullable after migration 20260810120000 SET NOT NULL broke GPS inserts.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FieldTrackingHealthState" AS ENUM (
    'TRACKING_HEALTHY',
    'NETWORK_DEGRADED',
    'LOCATION_STALE',
    'SERVICE_DEAD',
    'RECOVERY_IN_PROGRESS',
    'RECOVERY_FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FieldLocationSampleSource" AS ENUM ('EXPO', 'NATIVE_ANDROID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable UserActivitySession: split app vs native vs GPS vs server accept telemetry
ALTER TABLE "UserActivitySession"
  ADD COLUMN IF NOT EXISTS "appLastSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nativeLastSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastGpsCapturedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastServerAcceptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trackingHealthState" "FieldTrackingHealthState",
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

-- Backfill appLastSeenAt + lastServerAcceptAt from legacy lastSeenAt for MOBILE sessions
UPDATE "UserActivitySession"
SET
  "appLastSeenAt" = COALESCE("appLastSeenAt", "lastSeenAt"),
  "lastServerAcceptAt" = COALESCE("lastServerAcceptAt", "lastSeenAt")
WHERE "platform" = 'MOBILE'
  AND ("appLastSeenAt" IS NULL OR "lastServerAcceptAt" IS NULL);

-- AlterTable FieldLocationSample: idempotency keys + source tag
ALTER TABLE "FieldLocationSample"
  ADD COLUMN IF NOT EXISTS "ownerId" TEXT,
  ADD COLUMN IF NOT EXISTS "sampleId" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "FieldLocationSampleSource";

-- Backfill ownerId from shift (do NOT SET NOT NULL — prod hotfix 2026-08-10)
UPDATE "FieldLocationSample" AS s
SET "ownerId" = sh."ownerId"
FROM "FieldShift" AS sh
WHERE s."shiftId" = sh."id" AND s."ownerId" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FieldLocationSample_ownerId_sampleId_idx"
  ON "FieldLocationSample"("ownerId", "sampleId");

-- Owner+device scoped idempotency: same sampleId from same rep/device cannot create two rows
CREATE UNIQUE INDEX IF NOT EXISTS "FieldLocationSample_ownerId_deviceId_sampleId_key"
  ON "FieldLocationSample"("ownerId", "deviceId", "sampleId")
  WHERE "sampleId" IS NOT NULL;

-- AddForeignKey (skip if already present)
DO $$ BEGIN
  ALTER TABLE "FieldLocationSample"
    ADD CONSTRAINT "FieldLocationSample_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
