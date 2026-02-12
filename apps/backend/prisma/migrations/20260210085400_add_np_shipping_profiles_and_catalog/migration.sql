/*
  Warnings:

  - You are about to drop the `ContactRecipient` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "NpRecipientType" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "NpDeliveryType" AS ENUM ('WAREHOUSE', 'POSTOMAT', 'ADDRESS');

-- CreateEnum
CREATE TYPE "Carrier" AS ENUM ('NOVA_POSHTA');

-- DropForeignKey
ALTER TABLE "ContactRecipient" DROP CONSTRAINT "ContactRecipient_contactId_fkey";

-- DropTable
DROP TABLE "ContactRecipient";

-- CreateTable
CREATE TABLE "ContactShippingProfile" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "recipientType" "NpRecipientType" NOT NULL,
    "deliveryType" "NpDeliveryType" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "edrpou" TEXT,
    "contactPersonFirstName" TEXT,
    "contactPersonLastName" TEXT,
    "contactPersonMiddleName" TEXT,
    "contactPersonPhone" TEXT,
    "cityRef" TEXT,
    "cityName" TEXT,
    "warehouseRef" TEXT,
    "warehouseNumber" TEXT,
    "warehouseType" TEXT,
    "streetRef" TEXT,
    "streetName" TEXT,
    "building" TEXT,
    "flat" TEXT,
    "npCounterpartyRef" TEXT,
    "npContactPersonRef" TEXT,
    "npAddressRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactShippingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTtn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrier" "Carrier" NOT NULL DEFAULT 'NOVA_POSHTA',
    "documentNumber" TEXT NOT NULL,
    "documentRef" TEXT,
    "statusCode" TEXT,
    "statusText" TEXT,
    "cost" DOUBLE PRECISION,
    "estimatedDeliveryDate" TIMESTAMP(3),
    "payloadSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTtn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpCity" (
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" TEXT,
    "areaDescription" TEXT,
    "region" TEXT,
    "settlementTypeDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpCity_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpWarehouse" (
    "ref" TEXT NOT NULL,
    "cityRef" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "number" TEXT,
    "description" TEXT NOT NULL,
    "shortAddress" TEXT,
    "typeOfWarehouse" TEXT,
    "isPostomat" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpWarehouse_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpStreet" (
    "ref" TEXT NOT NULL,
    "cityRef" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpStreet_pkey" PRIMARY KEY ("ref")
);

-- CreateIndex
CREATE INDEX "ContactShippingProfile_contactId_idx" ON "ContactShippingProfile"("contactId");

-- CreateIndex
CREATE INDEX "ContactShippingProfile_contactId_isDefault_idx" ON "ContactShippingProfile"("contactId", "isDefault");

-- CreateIndex
CREATE INDEX "OrderTtn_orderId_idx" ON "OrderTtn"("orderId");

-- CreateIndex
CREATE INDEX "OrderTtn_documentNumber_idx" ON "OrderTtn"("documentNumber");

-- CreateIndex
CREATE INDEX "NpCity_description_idx" ON "NpCity"("description");

-- CreateIndex
CREATE INDEX "NpWarehouse_cityRef_idx" ON "NpWarehouse"("cityRef");

-- CreateIndex
CREATE INDEX "NpWarehouse_description_idx" ON "NpWarehouse"("description");

-- CreateIndex
CREATE INDEX "NpWarehouse_isPostomat_idx" ON "NpWarehouse"("isPostomat");

-- CreateIndex
CREATE INDEX "NpStreet_cityRef_idx" ON "NpStreet"("cityRef");

-- CreateIndex
CREATE INDEX "NpStreet_street_idx" ON "NpStreet"("street");

-- AddForeignKey
ALTER TABLE "ContactShippingProfile" ADD CONSTRAINT "ContactShippingProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTtn" ADD CONSTRAINT "OrderTtn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
