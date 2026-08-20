-- AlterTable
ALTER TABLE "FactoryOrderLine" ADD COLUMN "dueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FactoryOrderLine_dueAt_idx" ON "FactoryOrderLine"("dueAt");
