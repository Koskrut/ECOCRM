-- CreateEnum
CREATE TYPE "OutboundTargetType" AS ENUM ('LEAD', 'CONTACT_DORMANT');

-- CreateEnum
CREATE TYPE "OutboundAttemptStatus" AS ENUM ('PENDING', 'QUEUED', 'DIALING', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'CANCELED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "marketingCallOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OutboundCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" "OutboundTargetType" NOT NULL,
    "scenarioCode" TEXT NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundCallAttempt" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetType" "OutboundTargetType" NOT NULL,
    "leadId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "phoneNormalized" TEXT NOT NULL,
    "scenarioCode" TEXT NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "status" "OutboundAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerSessionId" TEXT,
    "callId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "outcome" JSONB,
    "webhookProcessedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundCallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundCampaign_isActive_idx" ON "OutboundCampaign"("isActive");

-- CreateIndex
CREATE INDEX "OutboundCampaign_targetType_idx" ON "OutboundCampaign"("targetType");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundCallAttempt_providerSessionId_key" ON "OutboundCallAttempt"("providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundCallAttempt_callId_key" ON "OutboundCallAttempt"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundCallAttempt_webhookProcessedId_key" ON "OutboundCallAttempt"("webhookProcessedId");

-- CreateIndex
CREATE INDEX "OutboundCallAttempt_campaignId_status_idx" ON "OutboundCallAttempt"("campaignId", "status");

-- CreateIndex
CREATE INDEX "OutboundCallAttempt_status_scheduledAt_idx" ON "OutboundCallAttempt"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OutboundCallAttempt_leadId_idx" ON "OutboundCallAttempt"("leadId");

-- CreateIndex
CREATE INDEX "OutboundCallAttempt_contactId_idx" ON "OutboundCallAttempt"("contactId");

-- AddForeignKey
ALTER TABLE "OutboundCallAttempt" ADD CONSTRAINT "OutboundCallAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutboundCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundCallAttempt" ADD CONSTRAINT "OutboundCallAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundCallAttempt" ADD CONSTRAINT "OutboundCallAttempt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundCallAttempt" ADD CONSTRAINT "OutboundCallAttempt_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
