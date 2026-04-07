-- CreateTable
CREATE TABLE IF NOT EXISTS "TelegramInboundUpdate" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramInboundUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramInboundUpdate_updateId_key" ON "TelegramInboundUpdate"("updateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramInboundUpdate_createdAt_idx" ON "TelegramInboundUpdate"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramInboundUpdate_telegramChatId_idx" ON "TelegramInboundUpdate"("telegramChatId");

-- Data cleanup before unique inbound index:
-- keep earliest message per (conversationId, tgMessageId), remove duplicates.
WITH ranked_duplicates AS (
    SELECT ctid
    FROM (
        SELECT
            ctid,
            ROW_NUMBER() OVER (
                PARTITION BY "conversationId", "tgMessageId"
                ORDER BY "createdAt" ASC, "id" ASC
            ) AS rn
        FROM "Message"
        WHERE "tgMessageId" IS NOT NULL
    ) ranked
    WHERE ranked.rn > 1
)
DELETE FROM "Message" m
USING ranked_duplicates d
WHERE m.ctid = d.ctid;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Message_conversationId_tgMessageId_key"
ON "Message"("conversationId", "tgMessageId");
