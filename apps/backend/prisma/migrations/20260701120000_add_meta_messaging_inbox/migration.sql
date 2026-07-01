-- AlterEnum
ALTER TYPE "ConversationChannel" ADD VALUE 'INSTAGRAM';
ALTER TYPE "ConversationChannel" ADD VALUE 'FACEBOOK';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'META_INSTAGRAM_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'META_FACEBOOK_MESSAGE';

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "telegramChatId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN "metaParticipantId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "externalMessageId" TEXT;

-- CreateTable
CREATE TABLE "MetaParticipant" (
    "id" TEXT NOT NULL,
    "platform" "ConversationChannel" NOT NULL,
    "participantId" TEXT NOT NULL,
    "displayName" TEXT,
    "profilePicUrl" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "MetaParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInboundEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaParticipant_platform_participantId_key" ON "MetaParticipant"("platform", "participantId");

-- CreateIndex
CREATE INDEX "MetaParticipant_contactId_idx" ON "MetaParticipant"("contactId");

-- CreateIndex
CREATE INDEX "MetaParticipant_leadId_idx" ON "MetaParticipant"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInboundEvent_eventKey_key" ON "MetaInboundEvent"("eventKey");

-- CreateIndex
CREATE INDEX "MetaInboundEvent_createdAt_idx" ON "MetaInboundEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_metaParticipantId_idx" ON "Conversation"("metaParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channel_metaParticipantId_key" ON "Conversation"("channel", "metaParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalMessageId_key" ON "Message"("conversationId", "externalMessageId");

-- AddForeignKey
ALTER TABLE "MetaParticipant" ADD CONSTRAINT "MetaParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaParticipant" ADD CONSTRAINT "MetaParticipant_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_metaParticipantId_fkey" FOREIGN KEY ("metaParticipantId") REFERENCES "MetaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
