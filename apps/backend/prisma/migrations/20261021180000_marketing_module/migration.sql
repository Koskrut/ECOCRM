-- Marketing module storage. Additive only.

ALTER TABLE "Contact" ADD COLUMN "marketingAdsOptOut" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "MarketingPlatform" AS ENUM ('META', 'GOOGLE', 'TIKTOK', 'OTHER');
CREATE TYPE "MarketingAccountStatus" AS ENUM ('CONNECTED', 'NEEDS_RECONNECT', 'DISABLED');
CREATE TYPE "MarketingEntityLevel" AS ENUM ('CAMPAIGN', 'AD_SET', 'AD');
CREATE TYPE "MarketingDeliveryStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'UNKNOWN');
CREATE TYPE "MarketingInsightSource" AS ENUM ('API', 'FILE');
CREATE TYPE "MarketingConversionKind" AS ENUM ('LEAD', 'QUALITY', 'JUNK', 'PURCHASE');
CREATE TYPE "MarketingOutboxStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');
CREATE TYPE "MarketingAudiencePreset" AS ENUM ('CLIENTS', 'LARGE_CLIENTS', 'DORMANT', 'OPEN_LEADS', 'LOST', 'JUNK_EXCLUSION');
CREATE TYPE "MarketingSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'UPDATED', 'FAILED', 'STOPPED');
CREATE TYPE "MarketingLinkChannel" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'TIKTOK', 'OTHER');

CREATE TABLE "MarketingAccount" (
    "id" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "MarketingAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "spendSource" TEXT NOT NULL DEFAULT 'api',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingAccount_platform_externalAccountId_key" ON "MarketingAccount"("platform", "externalAccountId");
CREATE INDEX "MarketingAccount_platform_status_idx" ON "MarketingAccount"("platform", "status");

CREATE TABLE "MarketingInsightDaily" (
    "id" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "accountExternalId" TEXT NOT NULL,
    "campaignExternalId" TEXT NOT NULL,
    "adSetExternalId" TEXT NOT NULL,
    "adExternalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(18,2) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "source" "MarketingInsightSource" NOT NULL DEFAULT 'API',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingInsightDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_insight_ad_day" ON "MarketingInsightDaily"("platform", "accountExternalId", "adExternalId", "date");
CREATE INDEX "MarketingInsightDaily_platform_date_idx" ON "MarketingInsightDaily"("platform", "date");
CREATE INDEX "MarketingInsightDaily_platform_campaignExternalId_date_idx" ON "MarketingInsightDaily"("platform", "campaignExternalId", "date");

CREATE TABLE "MarketingEntity" (
    "id" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "accountExternalId" TEXT NOT NULL,
    "level" "MarketingEntityLevel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "parentExternalId" TEXT,
    "name" TEXT NOT NULL,
    "deliveryStatus" "MarketingDeliveryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingEntity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_entity_key" ON "MarketingEntity"("platform", "accountExternalId", "level", "externalId");
CREATE INDEX "MarketingEntity_platform_level_idx" ON "MarketingEntity"("platform", "level");

CREATE TABLE "MarketingLink" (
    "id" TEXT NOT NULL,
    "channel" "MarketingLinkChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "campaignExternalId" TEXT,
    "fullUrl" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingLink_channel_idx" ON "MarketingLink"("channel");
CREATE INDEX "MarketingLink_utmCampaign_idx" ON "MarketingLink"("utmCampaign");

CREATE TABLE "MarketingLeadTouch" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "platform" "MarketingPlatform",
    "campaignExternalId" TEXT,
    "adSetExternalId" TEXT,
    "adExternalId" TEXT,
    "clickId" TEXT,
    "linkId" TEXT,
    "displayName" TEXT,
    "countsTowardAds" BOOLEAN NOT NULL DEFAULT false,
    "resolvedFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingLeadTouch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingLeadTouch_leadId_key" ON "MarketingLeadTouch"("leadId");
CREATE INDEX "MarketingLeadTouch_platform_campaignExternalId_idx" ON "MarketingLeadTouch"("platform", "campaignExternalId");
CREATE INDEX "MarketingLeadTouch_countsTowardAds_platform_idx" ON "MarketingLeadTouch"("countsTowardAds", "platform");
CREATE INDEX "MarketingLeadTouch_linkId_idx" ON "MarketingLeadTouch"("linkId");

ALTER TABLE "MarketingLeadTouch" ADD CONSTRAINT "MarketingLeadTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingLeadTouch" ADD CONSTRAINT "MarketingLeadTouch_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "MarketingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MarketingConversion" (
    "id" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "kind" "MarketingConversionKind" NOT NULL,
    "status" "MarketingOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "leadId" TEXT,
    "paymentId" TEXT,
    "externalEventId" TEXT,
    "valueAmount" DECIMAL(18,2),
    "valueCurrency" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "skippedReason" TEXT,
    "retract" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingConversion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingConversion_idempotencyKey_key" ON "MarketingConversion"("idempotencyKey");
CREATE INDEX "MarketingConversion_status_nextAttemptAt_idx" ON "MarketingConversion"("status", "nextAttemptAt");
CREATE INDEX "MarketingConversion_leadId_idx" ON "MarketingConversion"("leadId");
CREATE INDEX "MarketingConversion_paymentId_idx" ON "MarketingConversion"("paymentId");

ALTER TABLE "MarketingConversion" ADD CONSTRAINT "MarketingConversion_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingConversion" ADD CONSTRAINT "MarketingConversion_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MarketingAudience" (
    "id" TEXT NOT NULL,
    "preset" "MarketingAudiencePreset" NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "externalAudienceId" TEXT,
    "lastSize" INTEGER,
    "lastSkippedNoContact" INTEGER,
    "status" "MarketingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "config" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingAudience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingAudience_preset_platform_key" ON "MarketingAudience"("preset", "platform");

CREATE TABLE "MarketingAudienceSync" (
    "id" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "status" "MarketingSyncStatus" NOT NULL,
    "size" INTEGER,
    "skippedNoContact" INTEGER,
    "previousSize" INTEGER,
    "halted" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "MarketingAudienceSync_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingAudienceSync_audienceId_startedAt_idx" ON "MarketingAudienceSync"("audienceId", "startedAt");

ALTER TABLE "MarketingAudienceSync" ADD CONSTRAINT "MarketingAudienceSync_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MarketingAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
