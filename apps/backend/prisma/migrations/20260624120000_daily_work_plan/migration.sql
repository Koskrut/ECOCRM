-- CreateEnum
CREATE TYPE "DailyWorkPlanStatus" AS ENUM ('DRAFT', 'COMMITTED');

-- CreateEnum
CREATE TYPE "DailyWorkPlanItemKind" AS ENUM ('VISIT', 'TASK', 'CONTACT_ACTION', 'LEAD', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "DailyWorkPlanItemStatus" AS ENUM ('PLANNED', 'DISMISSED', 'DONE');

-- CreateTable
CREATE TABLE "DailyWorkPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "DailyWorkPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" "DailyWorkPlanItemKind" NOT NULL,
    "status" "DailyWorkPlanItemStatus" NOT NULL DEFAULT 'PLANNED',
    "position" INTEGER NOT NULL,
    "visitId" TEXT,
    "taskId" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "DailyWorkPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyWorkPlan_userId_date_idx" ON "DailyWorkPlan"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkPlan_userId_date_key" ON "DailyWorkPlan"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyWorkPlanItem_planId_position_idx" ON "DailyWorkPlanItem"("planId", "position");

-- CreateIndex
CREATE INDEX "DailyWorkPlanItem_visitId_idx" ON "DailyWorkPlanItem"("visitId");

-- CreateIndex
CREATE INDEX "DailyWorkPlanItem_taskId_idx" ON "DailyWorkPlanItem"("taskId");

-- CreateIndex
CREATE INDEX "DailyWorkPlanItem_contactId_idx" ON "DailyWorkPlanItem"("contactId");

-- CreateIndex
CREATE INDEX "DailyWorkPlanItem_leadId_idx" ON "DailyWorkPlanItem"("leadId");

-- AddForeignKey
ALTER TABLE "DailyWorkPlan" ADD CONSTRAINT "DailyWorkPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlanItem" ADD CONSTRAINT "DailyWorkPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlanItem" ADD CONSTRAINT "DailyWorkPlanItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlanItem" ADD CONSTRAINT "DailyWorkPlanItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlanItem" ADD CONSTRAINT "DailyWorkPlanItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlanItem" ADD CONSTRAINT "DailyWorkPlanItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
