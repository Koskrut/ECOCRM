-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE "PasswordResetCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTelegramLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE INDEX "PasswordResetCode_email_idx" ON "PasswordResetCode"("email");

-- CreateIndex
CREATE INDEX "PasswordResetCode_expiresAt_idx" ON "PasswordResetCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserTelegramLinkToken_token_key" ON "UserTelegramLinkToken"("token");

-- CreateIndex
CREATE INDEX "UserTelegramLinkToken_token_idx" ON "UserTelegramLinkToken"("token");

-- CreateIndex
CREATE INDEX "UserTelegramLinkToken_userId_idx" ON "UserTelegramLinkToken"("userId");

-- CreateIndex
CREATE INDEX "UserTelegramLinkToken_expiresAt_idx" ON "UserTelegramLinkToken"("expiresAt");
