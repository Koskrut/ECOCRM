-- AlterEnum
ALTER TYPE "MessageDirection" ADD VALUE IF NOT EXISTS 'INTERNAL';

-- AlterTable Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Conversation_pinnedAt_idx" ON "Conversation"("pinnedAt");

-- CreateTable CannedResponse
CREATE TABLE IF NOT EXISTS "CannedResponse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "shortcut" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CannedResponse_sortOrder_idx" ON "CannedResponse"("sortOrder");
CREATE INDEX IF NOT EXISTS "CannedResponse_shortcut_idx" ON "CannedResponse"("shortcut");

DO $$ BEGIN
  ALTER TABLE "CannedResponse" ADD CONSTRAINT "CannedResponse_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
