-- CreateTable
CREATE TABLE "FuelRefuelEntry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fuelDayReportId" TEXT NOT NULL,
    "liters" DECIMAL(10,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "receiptStorageKey" TEXT NOT NULL,
    "receiptFileName" TEXT NOT NULL,
    "receiptMimeType" TEXT NOT NULL,
    "receiptSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelRefuelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelRefuelEntry_ownerId_date_idx" ON "FuelRefuelEntry"("ownerId", "date");

-- CreateIndex
CREATE INDEX "FuelRefuelEntry_fuelDayReportId_idx" ON "FuelRefuelEntry"("fuelDayReportId");

-- AddForeignKey
ALTER TABLE "FuelRefuelEntry" ADD CONSTRAINT "FuelRefuelEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRefuelEntry" ADD CONSTRAINT "FuelRefuelEntry_fuelDayReportId_fkey" FOREIGN KEY ("fuelDayReportId") REFERENCES "FuelDayReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
