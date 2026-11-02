-- Joint inbox: extra managers on a conversation (alongside assignedToUserId).

CREATE TABLE "ConversationCollaborator" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationCollaborator_pkey" PRIMARY KEY ("conversationId","userId")
);

CREATE INDEX "ConversationCollaborator_userId_idx" ON "ConversationCollaborator"("userId");

ALTER TABLE "ConversationCollaborator" ADD CONSTRAINT "ConversationCollaborator_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationCollaborator" ADD CONSTRAINT "ConversationCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationCollaborator" ADD CONSTRAINT "ConversationCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
