-- Manual Calling / Call Workspace Phase 1 (separate from AI OutboundCallAttempt)

-- Prisma enum ActivityType: add MANUAL_CALL
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MANUAL_CALL';

CREATE TYPE "CallQueueItemStatus" AS ENUM ('PENDING', 'CLAIMED', 'SKIPPED', 'DONE', 'CANCELLED');
CREATE TYPE "ManualCallSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ManualCallOutcome" AS ENUM (
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
  'GATEKEEPER',
  'NOT_INTERESTED',
  'INTERESTED',
  'REQUESTED_OFFER',
  'REQUESTED_CALLBACK',
  'MEETING_SCHEDULED',
  'CONVERTED'
);

CREATE TABLE "CallQueueItem" (
  "id" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "leadId" TEXT,
  "contactId" TEXT,
  "companyId" TEXT,
  "status" "CallQueueItemStatus" NOT NULL DEFAULT 'PENDING',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualCallSession" (
  "id" TEXT NOT NULL,
  "queueItemId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "ManualCallSessionStatus" NOT NULL DEFAULT 'OPEN',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "outcome" "ManualCallOutcome",
  "note" TEXT,
  "callbackAt" TIMESTAMP(3),
  "targetPhoneNormalized" TEXT,
  "callId" TEXT,
  "activityId" TEXT,
  "completionIdempotencyKey" TEXT,
  "leadId" TEXT,
  "contactId" TEXT,
  "companyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManualCallSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualCallSession_activityId_key" ON "ManualCallSession"("activityId");
CREATE UNIQUE INDEX "ManualCallSession_completionIdempotencyKey_key" ON "ManualCallSession"("completionIdempotencyKey");

CREATE INDEX "CallQueueItem_assigneeId_status_sortOrder_idx" ON "CallQueueItem"("assigneeId", "status", "sortOrder");
CREATE INDEX "CallQueueItem_assigneeId_status_idx" ON "CallQueueItem"("assigneeId", "status");

CREATE INDEX "ManualCallSession_queueItemId_idx" ON "ManualCallSession"("queueItemId");
CREATE INDEX "ManualCallSession_userId_status_idx" ON "ManualCallSession"("userId", "status");
CREATE INDEX "ManualCallSession_callId_idx" ON "ManualCallSession"("callId");

ALTER TABLE "CallQueueItem" ADD CONSTRAINT "CallQueueItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallQueueItem" ADD CONSTRAINT "CallQueueItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallQueueItem" ADD CONSTRAINT "CallQueueItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallQueueItem" ADD CONSTRAINT "CallQueueItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "CallQueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualCallSession" ADD CONSTRAINT "ManualCallSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
