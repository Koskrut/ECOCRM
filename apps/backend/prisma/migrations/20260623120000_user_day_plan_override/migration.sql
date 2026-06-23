-- CreateTable
CREATE TABLE "UserDayPlanOverride" (
    "userId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "thresholds" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "UserDayPlanOverride_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserDayPlanOverride" ADD CONSTRAINT "UserDayPlanOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDayPlanOverride" ADD CONSTRAINT "UserDayPlanOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
