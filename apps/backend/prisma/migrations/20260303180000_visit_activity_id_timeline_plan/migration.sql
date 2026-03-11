-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "activityId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Visit_activityId_key" ON "Visit"("activityId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
