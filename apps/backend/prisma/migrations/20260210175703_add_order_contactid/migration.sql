-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "contactId" TEXT;

-- CreateIndex
CREATE INDEX "Order_contactId_idx" ON "Order"("contactId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
