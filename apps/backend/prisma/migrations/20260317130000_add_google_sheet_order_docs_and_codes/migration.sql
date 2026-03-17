-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN "externalCode" TEXT;

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN "externalCode" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "documentRequisites" JSONB;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "documentDisplayName" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "invoiceDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "waybillNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "waybillDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "exchangeRate" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_externalCode_key" ON "Warehouse"("externalCode");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_externalCode_key" ON "BankAccount"("externalCode");
