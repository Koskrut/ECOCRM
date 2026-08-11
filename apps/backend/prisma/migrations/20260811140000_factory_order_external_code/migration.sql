-- AlterTable
ALTER TABLE "FactoryOrder" ADD COLUMN "externalCode" TEXT;
ALTER TABLE "FactoryOrder" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "FactoryOrder" ADD COLUMN "approvedById" TEXT;
