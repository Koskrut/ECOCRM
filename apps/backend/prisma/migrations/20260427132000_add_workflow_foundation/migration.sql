CREATE TYPE "WorkflowTriggerType" AS ENUM (
    'RECORD_CREATED',
    'RECORD_UPDATED',
    'FIELD_CHANGED',
    'STATUS_CHANGED',
    'SCHEDULE',
    'WEBHOOK_RECEIVED'
);

CREATE TYPE "WorkflowExecutionStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED',
    'SKIPPED',
    'RATE_LIMITED'
);

CREATE TABLE "WorkflowRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" "CustomFieldEntityType",
    "triggerType" "WorkflowTriggerType" NOT NULL,
    "triggerConfig" JSONB,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "rateLimitPerEntityPerHour" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowExecutionLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType",
    "entityId" TEXT,
    "triggerType" "WorkflowTriggerType" NOT NULL,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT,
    "triggerPayload" JSONB,
    "actionsResult" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowRule_key_key" ON "WorkflowRule"("key");
CREATE INDEX "WorkflowRule_entityType_triggerType_idx" ON "WorkflowRule"("entityType", "triggerType");
CREATE INDEX "WorkflowRule_isActive_idx" ON "WorkflowRule"("isActive");
CREATE INDEX "WorkflowRule_deletedAt_idx" ON "WorkflowRule"("deletedAt");

CREATE INDEX "WorkflowExecutionLog_ruleId_createdAt_idx" ON "WorkflowExecutionLog"("ruleId", "createdAt");
CREATE INDEX "WorkflowExecutionLog_entityType_entityId_createdAt_idx" ON "WorkflowExecutionLog"("entityType", "entityId", "createdAt");
CREATE INDEX "WorkflowExecutionLog_correlationId_idx" ON "WorkflowExecutionLog"("correlationId");
CREATE INDEX "WorkflowExecutionLog_status_createdAt_idx" ON "WorkflowExecutionLog"("status", "createdAt");

ALTER TABLE "WorkflowExecutionLog"
    ADD CONSTRAINT "WorkflowExecutionLog_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "WorkflowRule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
