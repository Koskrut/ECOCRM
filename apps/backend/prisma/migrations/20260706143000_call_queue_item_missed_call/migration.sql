-- AlterTable
ALTER TABLE "CallQueueItem" ADD COLUMN "callId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CallQueueItem_callId_key" ON "CallQueueItem"("callId");

-- CreateIndex
CREATE INDEX "CallQueueItem_assigneeId_contactId_status_idx" ON "CallQueueItem"("assigneeId", "contactId", "status");

-- CreateIndex
CREATE INDEX "CallQueueItem_assigneeId_leadId_status_idx" ON "CallQueueItem"("assigneeId", "leadId", "status");

-- AddForeignKey
ALTER TABLE "CallQueueItem" ADD CONSTRAINT "CallQueueItem_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
