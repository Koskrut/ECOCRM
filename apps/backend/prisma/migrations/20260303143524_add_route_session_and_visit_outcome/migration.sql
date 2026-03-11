-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('SUCCESS', 'FOLLOW_UP', 'NO_DECISION', 'NOT_RELEVANT', 'FAILED');

-- AlterEnum
ALTER TYPE "VisitStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "nextActionNote" TEXT,
ADD COLUMN     "outcome" "VisitOutcome",
ADD COLUMN     "resultNote" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RouteSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "routePlanId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVisitId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteSession_date_idx" ON "RouteSession"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RouteSession_ownerId_date_key" ON "RouteSession"("ownerId", "date");

-- AddForeignKey
ALTER TABLE "RouteSession" ADD CONSTRAINT "RouteSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSession" ADD CONSTRAINT "RouteSession_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSession" ADD CONSTRAINT "RouteSession_currentVisitId_fkey" FOREIGN KEY ("currentVisitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
