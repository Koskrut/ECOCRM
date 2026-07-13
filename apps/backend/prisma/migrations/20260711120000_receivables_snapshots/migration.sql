-- CreateEnum
CREATE TYPE "ReceivablesReconcileStatus" AS ENUM ('ALIGNED', 'DELTA_1C_MORE', 'DELTA_CRM_MORE', 'ONLY_1C', 'ONLY_CRM');

-- CreateTable
CREATE TABLE "ReceivablesSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,
    "note" TEXT,
    "total1C" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCRM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deltaCount" INTEGER NOT NULL DEFAULT 0,
    "alignedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivablesSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivablesSnapshotLine" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "counterpartyCode1C" TEXT NOT NULL,
    "amount1C" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountCRM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contactId" TEXT,
    "status" "ReceivablesReconcileStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivablesSnapshotLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceivablesSnapshot_snapshotDate_idx" ON "ReceivablesSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "ReceivablesSnapshot_importedAt_idx" ON "ReceivablesSnapshot"("importedAt");

-- CreateIndex
CREATE INDEX "ReceivablesSnapshot_importedById_idx" ON "ReceivablesSnapshot"("importedById");

-- CreateIndex
CREATE INDEX "ReceivablesSnapshotLine_snapshotId_idx" ON "ReceivablesSnapshotLine"("snapshotId");

-- CreateIndex
CREATE INDEX "ReceivablesSnapshotLine_counterpartyCode1C_idx" ON "ReceivablesSnapshotLine"("counterpartyCode1C");

-- CreateIndex
CREATE INDEX "ReceivablesSnapshotLine_contactId_idx" ON "ReceivablesSnapshotLine"("contactId");

-- CreateIndex
CREATE INDEX "ReceivablesSnapshotLine_status_idx" ON "ReceivablesSnapshotLine"("status");

-- AddForeignKey
ALTER TABLE "ReceivablesSnapshot" ADD CONSTRAINT "ReceivablesSnapshot_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivablesSnapshotLine" ADD CONSTRAINT "ReceivablesSnapshotLine_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReceivablesSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivablesSnapshotLine" ADD CONSTRAINT "ReceivablesSnapshotLine_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
