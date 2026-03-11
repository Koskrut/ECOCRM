-- CreateEnum
CREATE TYPE "ProductImageSource" AS ENUM ('google_drive');

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "source" "ProductImageSource" NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- Add primaryImageId to Product
ALTER TABLE "Product" ADD COLUMN "primaryImageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_source_fileId_key" ON "ProductImage"("productId", "source", "fileId");
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");
CREATE INDEX "ProductImage_source_fileId_idx" ON "ProductImage"("source", "fileId");

-- CreateIndex Product.primaryImageId unique (one product can be primary for at most one product - actually it's 1:1 so unique is correct)
CREATE UNIQUE INDEX "Product_primaryImageId_key" ON "Product"("primaryImageId");
CREATE INDEX "Product_primaryImageId_idx" ON "Product"("primaryImageId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Product.primaryImageId -> ProductImage.id
ALTER TABLE "Product" ADD CONSTRAINT "Product_primaryImageId_fkey" FOREIGN KEY ("primaryImageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
