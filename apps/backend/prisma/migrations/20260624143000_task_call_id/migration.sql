-- AlterTable
ALTER TABLE "Task" ADD COLUMN "callId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_callId_key" ON "Task"("callId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
