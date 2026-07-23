-- CreateEnum
CREATE TYPE "RiskDomainId" AS ENUM ('CLIENT_CREDIT', 'CLIENT_HEALTH', 'CASH_OPS', 'FX', 'INV', 'MFG', 'SHIP', 'FIELD', 'TEAM', 'QA', 'LEAD', 'SYS');

-- CreateEnum
CREATE TYPE "RiskSubjectType" AS ENUM ('CONTACT', 'COMPANY', 'ORDER', 'LEAD', 'PRODUCT', 'WAREHOUSE', 'PRODUCTION_BATCH', 'PACKING_LIST', 'FACTORY_ORDER', 'VISIT', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskDecisionOutcome" AS ENUM ('ALLOW', 'WARN', 'REQUIRE_APPROVAL', 'BLOCK');

-- CreateEnum
CREATE TYPE "CreditProfileStatus" AS ENUM ('ACTIVE', 'WATCH', 'HOLD', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RiskClass" AS ENUM ('A', 'B', 'C', 'D', 'BLOCK');

-- CreateEnum
CREATE TYPE "RiskPlaybookRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CreditProfile" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "utilizedExposure" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "availableCredit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "riskClass" "RiskClass" NOT NULL DEFAULT 'B',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 14,
    "status" "CreditProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSignalEvent" (
    "id" TEXT NOT NULL,
    "domain" "RiskDomainId" NOT NULL,
    "signalCode" TEXT NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "subjectType" "RiskSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskSignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskScoreSnapshot" (
    "id" TEXT NOT NULL,
    "domain" "RiskDomainId" NOT NULL,
    "subjectType" "RiskSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "RiskBand" NOT NULL,
    "reasons" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'scorecard-v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseRiskSnapshot" (
    "id" TEXT NOT NULL,
    "eriScore" INTEGER NOT NULL,
    "eriBand" "RiskBand" NOT NULL,
    "breakdown" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'eri-v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPolicy" (
    "id" TEXT NOT NULL,
    "domain" "RiskDomainId" NOT NULL,
    "rules" JSONB NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskDecision" (
    "id" TEXT NOT NULL,
    "domain" "RiskDomainId" NOT NULL,
    "gatePoint" TEXT NOT NULL,
    "outcome" "RiskDecisionOutcome" NOT NULL,
    "subjectType" "RiskSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "orderId" TEXT,
    "reasons" JSONB NOT NULL,
    "scoreSnapshot" JSONB,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPlaybook" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "domain" "RiskDomainId" NOT NULL,
    "triggerBand" "RiskBand" NOT NULL,
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPlaybookRun" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "domain" "RiskDomainId" NOT NULL,
    "subjectType" "RiskSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "RiskPlaybookRunStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskPlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditProfile_contactId_key" ON "CreditProfile"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditProfile_companyId_key" ON "CreditProfile"("companyId");

-- CreateIndex
CREATE INDEX "CreditProfile_status_idx" ON "CreditProfile"("status");

-- CreateIndex
CREATE INDEX "CreditProfile_riskClass_idx" ON "CreditProfile"("riskClass");

-- CreateIndex
CREATE INDEX "RiskSignalEvent_domain_occurredAt_idx" ON "RiskSignalEvent"("domain", "occurredAt");

-- CreateIndex
CREATE INDEX "RiskSignalEvent_subjectType_subjectId_idx" ON "RiskSignalEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "RiskSignalEvent_signalCode_occurredAt_idx" ON "RiskSignalEvent"("signalCode", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskScoreSnapshot_domain_subjectType_subjectId_key" ON "RiskScoreSnapshot"("domain", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "RiskScoreSnapshot_domain_band_idx" ON "RiskScoreSnapshot"("domain", "band");

-- CreateIndex
CREATE INDEX "RiskScoreSnapshot_computedAt_idx" ON "RiskScoreSnapshot"("computedAt");

-- CreateIndex
CREATE INDEX "EnterpriseRiskSnapshot_computedAt_idx" ON "EnterpriseRiskSnapshot"("computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskPolicy_domain_key" ON "RiskPolicy"("domain");

-- CreateIndex
CREATE INDEX "RiskDecision_outcome_createdAt_idx" ON "RiskDecision"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "RiskDecision_orderId_idx" ON "RiskDecision"("orderId");

-- CreateIndex
CREATE INDEX "RiskDecision_subjectType_subjectId_idx" ON "RiskDecision"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskPlaybook_key_key" ON "RiskPlaybook"("key");

-- CreateIndex
CREATE INDEX "RiskPlaybookRun_playbookId_createdAt_idx" ON "RiskPlaybookRun"("playbookId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskPlaybookRun_subjectType_subjectId_idx" ON "RiskPlaybookRun"("subjectType", "subjectId");

-- AddForeignKey
ALTER TABLE "CreditProfile" ADD CONSTRAINT "CreditProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditProfile" ADD CONSTRAINT "CreditProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskPlaybookRun" ADD CONSTRAINT "RiskPlaybookRun_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "RiskPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
