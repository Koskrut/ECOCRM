-- AlterEnum: add SPAM to LeadStatus
ALTER TYPE "LeadStatus" ADD VALUE 'SPAM';

-- AlterEnum: add META to LeadSource
ALTER TYPE "LeadSource" ADD VALUE 'META';

-- CreateEnum: LeadChannel
CREATE TYPE "LeadChannel" AS ENUM ('FB_LEAD_ADS', 'IG_LEAD_ADS', 'FB_DM', 'IG_DM');

-- CreateEnum: LeadEventType
CREATE TYPE "LeadEventType" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'NOTE', 'CONTACTED', 'STATUS_CHANGED', 'DUPLICATE_MERGED');

-- CreateEnum: LeadIdentityType
CREATE TYPE "LeadIdentityType" AS ENUM ('PHONE', 'EMAIL', 'META_LEAD_ID', 'IG_PROFILE_ID', 'FB_PROFILE_ID');

-- AlterTable Lead: add new columns
ALTER TABLE "Lead" ADD COLUMN "channel" "LeadChannel",
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "fullName" TEXT,
ADD COLUMN "phoneNormalized" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "comment" TEXT,
ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Lead_phoneNormalized_idx" ON "Lead"("phoneNormalized");

-- CreateTable LeadMetaAttribution
CREATE TABLE "LeadMetaAttribution" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "metaLeadId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "pageId" TEXT,
    "igAccountId" TEXT,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "adsetName" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMetaAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadMetaAttribution_leadId_key" ON "LeadMetaAttribution"("leadId");

-- CreateTable LeadAnswer
CREATE TABLE "LeadAnswer" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadAnswer_leadId_idx" ON "LeadAnswer"("leadId");

-- CreateTable LeadEvent
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadEvent_leadId_idx" ON "LeadEvent"("leadId");

-- CreateTable LeadIdentity
CREATE TABLE "LeadIdentity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadIdentityType" NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadIdentity_type_value_key" ON "LeadIdentity"("type", "value");
CREATE INDEX "LeadIdentity_leadId_idx" ON "LeadIdentity"("leadId");

-- AddForeignKey
ALTER TABLE "LeadMetaAttribution" ADD CONSTRAINT "LeadMetaAttribution_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAnswer" ADD CONSTRAINT "LeadAnswer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadIdentity" ADD CONSTRAINT "LeadIdentity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
