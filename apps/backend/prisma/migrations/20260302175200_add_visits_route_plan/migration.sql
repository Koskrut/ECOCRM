-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED_UNASSIGNED', 'SCHEDULED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('NONE', 'FROM_CONTACT', 'GEOCODED', 'PIN_ADJUSTED', 'GPS_SET');

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "addressText" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationSource" "LocationSource" NOT NULL DEFAULT 'NONE',
    "radiusM" INTEGER NOT NULL DEFAULT 100,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED_UNASSIGNED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteStop" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_ownerId_status_idx" ON "Visit"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Visit_ownerId_startsAt_idx" ON "Visit"("ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "Visit_companyId_idx" ON "Visit"("companyId");

-- CreateIndex
CREATE INDEX "Visit_contactId_idx" ON "Visit"("contactId");

-- CreateIndex
CREATE INDEX "RoutePlan_date_idx" ON "RoutePlan"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlan_ownerId_date_key" ON "RoutePlan"("ownerId", "date");

-- CreateIndex
CREATE INDEX "RouteStop_visitId_idx" ON "RouteStop"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_routePlanId_position_key" ON "RouteStop"("routePlanId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_routePlanId_visitId_key" ON "RouteStop"("routePlanId", "visitId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
