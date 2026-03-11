-- AlterTable: User - add legacy and sync fields
ALTER TABLE "User" ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable: Company
ALTER TABLE "Company" ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable: Contact
ALTER TABLE "Contact" ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable: ContactPhone - add legacy fields and change unique to (contactId, phoneNormalized)
ALTER TABLE "ContactPhone" ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "ContactPhone_phoneNormalized_key";
CREATE UNIQUE INDEX "ContactPhone_contactId_phoneNormalized_key" ON "ContactPhone"("contactId", "phoneNormalized");

-- AlterTable: Lead
ALTER TABLE "Lead" ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable: Order
ALTER TABLE "Order" ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable: OrderItem - productId optional, productNameSnapshot, legacy fields
ALTER TABLE "OrderItem" ADD COLUMN     "productNameSnapshot" TEXT,
ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyRaw" JSONB,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;

-- CreateTable: IntegrationSyncState
CREATE TABLE "IntegrationSyncState" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastCursor" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "status" TEXT,
    "error" TEXT,

    CONSTRAINT "IntegrationSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: legacy unique constraints
CREATE UNIQUE INDEX "User_legacySource_legacyId_key" ON "User"("legacySource", "legacyId");
CREATE UNIQUE INDEX "Company_legacySource_legacyId_key" ON "Company"("legacySource", "legacyId");
CREATE UNIQUE INDEX "Contact_legacySource_legacyId_key" ON "Contact"("legacySource", "legacyId");
CREATE UNIQUE INDEX "Lead_legacySource_legacyId_key" ON "Lead"("legacySource", "legacyId");
CREATE UNIQUE INDEX "Order_legacySource_legacyId_key" ON "Order"("legacySource", "legacyId");
CREATE UNIQUE INDEX "OrderItem_legacySource_legacyId_key" ON "OrderItem"("legacySource", "legacyId");

CREATE UNIQUE INDEX "IntegrationSyncState_integration_entity_key" ON "IntegrationSyncState"("integration", "entity");
