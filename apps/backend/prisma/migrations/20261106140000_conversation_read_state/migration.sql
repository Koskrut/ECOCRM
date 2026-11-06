-- Per-user Telegram inbox read cursor, plus an index for unread counts.

CREATE TABLE "ConversationReadState" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("conversationId","userId")
);

CREATE INDEX "ConversationReadState_userId_idx" ON "ConversationReadState"("userId");

ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Message_conversationId_direction_sentAt_idx" ON "Message"("conversationId", "direction", "sentAt");
