-- CreateTable
CREATE TABLE "TelegramBotSession" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "payload" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramBotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramClientNotifyLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramClientNotifyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBotSession_telegramUserId_key" ON "TelegramBotSession"("telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramBotSession_updatedAt_idx" ON "TelegramBotSession"("updatedAt");

-- CreateIndex
CREATE INDEX "TelegramClientNotifyLog_orderId_idx" ON "TelegramClientNotifyLog"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramClientNotifyLog_orderId_kind_fingerprint_key" ON "TelegramClientNotifyLog"("orderId", "kind", "fingerprint");
