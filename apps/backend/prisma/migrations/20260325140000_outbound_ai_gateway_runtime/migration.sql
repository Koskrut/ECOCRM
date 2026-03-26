-- AlterTable
ALTER TABLE "OutboundCallAttempt" ADD COLUMN     "runtimeProvider" TEXT,
ADD COLUMN     "externalSessionId" TEXT,
ADD COLUMN     "providerCallId" TEXT,
ADD COLUMN     "openaiCallId" TEXT,
ADD COLUMN     "recordingExternalId" TEXT,
ADD COLUMN     "transcriptStatus" TEXT,
ADD COLUMN     "summaryStatus" TEXT,
ADD COLUMN     "classificationStatus" TEXT,
ADD COLUMN     "transferStatus" TEXT,
ADD COLUMN     "catalogSentAt" TIMESTAMP(3),
ADD COLUMN     "lastRuntimeEventAt" TIMESTAMP(3),
ADD COLUMN     "lastRuntimeEventType" TEXT,
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "failureReason" TEXT;

-- CreateTable
CREATE TABLE "OutboundRuntimeWebhookEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "deliveryId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'gateway',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundRuntimeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundRuntimeWebhookEvent_deliveryId_key" ON "OutboundRuntimeWebhookEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "OutboundRuntimeWebhookEvent_attemptId_idx" ON "OutboundRuntimeWebhookEvent"("attemptId");

-- CreateIndex
CREATE INDEX "OutboundRuntimeWebhookEvent_eventType_idx" ON "OutboundRuntimeWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "OutboundCallAttempt_externalSessionId_idx" ON "OutboundCallAttempt"("externalSessionId");

-- AddForeignKey
ALTER TABLE "OutboundRuntimeWebhookEvent" ADD CONSTRAINT "OutboundRuntimeWebhookEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "OutboundCallAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
