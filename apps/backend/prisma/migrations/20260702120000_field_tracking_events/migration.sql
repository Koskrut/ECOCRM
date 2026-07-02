-- CreateEnum
CREATE TYPE "FieldTrackingEventType" AS ENUM ('TRACKING_TASK_RESTARTED');

-- CreateEnum
CREATE TYPE "FieldTrackingRestartReason" AS ENUM ('OS_KILL', 'TIER_CHANGE', 'APPSTATE', 'WATCHDOG');

-- CreateTable
CREATE TABLE "FieldTrackingEvent" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "FieldTrackingEventType" NOT NULL,
    "reason" "FieldTrackingRestartReason",
    "clientRecordedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldTrackingEvent_shiftId_clientRecordedAt_idx" ON "FieldTrackingEvent"("shiftId", "clientRecordedAt");

-- CreateIndex
CREATE INDEX "FieldTrackingEvent_ownerId_clientRecordedAt_idx" ON "FieldTrackingEvent"("ownerId", "clientRecordedAt");

-- CreateIndex
CREATE INDEX "FieldTrackingEvent_type_clientRecordedAt_idx" ON "FieldTrackingEvent"("type", "clientRecordedAt");

-- AddForeignKey
ALTER TABLE "FieldTrackingEvent" ADD CONSTRAINT "FieldTrackingEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FieldShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTrackingEvent" ADD CONSTRAINT "FieldTrackingEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
