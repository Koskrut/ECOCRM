-- CreateTable
CREATE TABLE "LeadItem" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadItem_leadId_idx" ON "LeadItem"("leadId");

-- CreateIndex
CREATE INDEX "LeadItem_productId_idx" ON "LeadItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadItem_leadId_productId_key" ON "LeadItem"("leadId", "productId");

-- AddForeignKey
ALTER TABLE "LeadItem" ADD CONSTRAINT "LeadItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadItem" ADD CONSTRAINT "LeadItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
