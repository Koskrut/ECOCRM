-- Add minimal follow-up fields to Contact for PR5.
ALTER TABLE "Contact"
ADD COLUMN "nextActionType" TEXT,
ADD COLUMN "nextActionAt" TIMESTAMP(3),
ADD COLUMN "nextActionNote" TEXT,
ADD COLUMN "clientStage" TEXT;
