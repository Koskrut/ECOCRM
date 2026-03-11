/*
  Warnings:

  - A unique constraint covering the columns `[callId]` on the table `Activity` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bankTransactionId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BankTransaction_bankAccountId_externalId_key";

-- DropIndex
DROP INDEX "Payment_bankTransactionId_key";

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "callId" TEXT;

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "fromNormalized" TEXT,
    "toNormalized" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "status" TEXT NOT NULL,
    "recordingUrl" TEXT,
    "recordingStatus" TEXT,
    "utm" JSONB,
    "meta" JSONB,
    "rawPayload" JSONB NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "companyId" TEXT,
    "managerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSetting" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "companyId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webhookSecret" TEXT,
    "apiToken" TEXT,
    "config" JSONB,
    "lastWebhookAt" TIMESTAMP(3),
    "lastPollAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Call_fromNormalized_idx" ON "Call"("fromNormalized");

-- CreateIndex
CREATE INDEX "Call_toNormalized_idx" ON "Call"("toNormalized");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "Call"("startedAt");

-- CreateIndex
CREATE INDEX "Call_contactId_idx" ON "Call"("contactId");

-- CreateIndex
CREATE INDEX "Call_leadId_idx" ON "Call"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_provider_externalId_key" ON "Call"("provider", "externalId");

-- CreateIndex
CREATE INDEX "IntegrationSetting_provider_idx" ON "IntegrationSetting"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSetting_provider_companyId_key" ON "IntegrationSetting"("provider", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_callId_key" ON "Activity"("callId");

-- CreateIndex
CREATE INDEX "Activity_callId_idx" ON "Activity"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bankTransactionId_key" ON "Payment"("bankTransactionId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
