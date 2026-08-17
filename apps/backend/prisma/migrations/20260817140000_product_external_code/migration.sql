-- AlterTable
ALTER TABLE "Product" ADD COLUMN "externalCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_externalCode_key" ON "Product"("externalCode");
