-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'NOVA_POSHTA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('FOP', 'CASH');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryData" JSONB,
ADD COLUMN     "deliveryMethod" "DeliveryMethod",
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- CreateTable
CREATE TABLE "ContactRecipient" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRecipient_contactId_idx" ON "ContactRecipient"("contactId");

-- AddForeignKey
ALTER TABLE "ContactRecipient" ADD CONSTRAINT "ContactRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
