-- Pipeline audit/history for orders/leads pipeline config snapshots.
CREATE TABLE "PipelineConfigHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "summary" TEXT,
    "beforeSnapshot" JSONB NOT NULL,
    "afterSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineConfigHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PipelineConfigHistory_entityType_createdAt_idx" ON "PipelineConfigHistory"("entityType", "createdAt");
CREATE INDEX "PipelineConfigHistory_createdAt_idx" ON "PipelineConfigHistory"("createdAt");
