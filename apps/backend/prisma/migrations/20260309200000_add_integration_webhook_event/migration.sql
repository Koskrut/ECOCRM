-- CreateTable
CREATE TABLE "IntegrationWebhookEvent" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityLegacyId" INTEGER,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT,
    "status" TEXT,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_integration_idx" ON "IntegrationWebhookEvent"("integration");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_eventType_idx" ON "IntegrationWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_entityType_idx" ON "IntegrationWebhookEvent"("entityType");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_entityLegacyId_idx" ON "IntegrationWebhookEvent"("entityLegacyId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_status_idx" ON "IntegrationWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_receivedAt_idx" ON "IntegrationWebhookEvent"("receivedAt");
