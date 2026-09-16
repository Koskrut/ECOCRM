-- AlterEnum
ALTER TYPE "FieldTrackingEventType" ADD VALUE IF NOT EXISTS 'SHIFT_ENDED';
ALTER TYPE "FieldTrackingEventType" ADD VALUE IF NOT EXISTS 'SAMPLES_BATCH_ANOMALY';

-- AlterEnum
ALTER TYPE "FieldTrackingRestartReason" ADD VALUE IF NOT EXISTS 'MANUAL';

-- AlterTable
ALTER TABLE "UserActivitySession" ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE "UserActivitySession" ADD COLUMN IF NOT EXISTS "appVersionCode" TEXT;
ALTER TABLE "UserActivitySession" ADD COLUMN IF NOT EXISTS "manufacturer" TEXT;
ALTER TABLE "UserActivitySession" ADD COLUMN IF NOT EXISTS "trackingSource" TEXT;
