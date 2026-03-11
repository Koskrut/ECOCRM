-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- CreateTable
CREATE TABLE "CompanyChangeHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "changedBy" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyChangeHistory_companyId_idx" ON "CompanyChangeHistory"("companyId");

-- CreateIndex
CREATE INDEX "CompanyChangeHistory_createdAt_idx" ON "CompanyChangeHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "CompanyChangeHistory" ADD CONSTRAINT "CompanyChangeHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
