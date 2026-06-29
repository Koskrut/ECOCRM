-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('WEB', 'MOBILE');

-- CreateTable
CREATE TABLE "UserActivitySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "ClientPlatform" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "ipCity" TEXT,
    "ipRegion" TEXT,
    "ipCountry" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserActivitySession_userId_lastSeenAt_idx" ON "UserActivitySession"("userId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "UserActivitySession_userId_startedAt_idx" ON "UserActivitySession"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "UserActivitySession" ADD CONSTRAINT "UserActivitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
