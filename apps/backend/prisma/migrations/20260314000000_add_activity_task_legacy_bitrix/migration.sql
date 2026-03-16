-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "legacySource" TEXT,
ADD COLUMN "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "legacySource" TEXT,
ADD COLUMN "legacyId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_legacySource_legacyId_key" ON "Activity"("legacySource", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_legacySource_legacyId_key" ON "Task"("legacySource", "legacyId");
