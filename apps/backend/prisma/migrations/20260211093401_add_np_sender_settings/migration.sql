-- CreateTable
CREATE TABLE "NpSenderSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "cityRef" TEXT NOT NULL,
    "warehouseRef" TEXT NOT NULL,
    "counterpartyRef" TEXT NOT NULL,
    "contactPersonRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpSenderSettings_pkey" PRIMARY KEY ("id")
);
