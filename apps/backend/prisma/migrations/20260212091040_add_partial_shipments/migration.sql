-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "qtyShipped" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
-- 1) добавляем колонку, только если её нет
ALTER TABLE "OrderTtn" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 2) бэкофиллим существующие строки
UPDATE "OrderTtn"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
WHERE "updatedAt" IS NULL;

-- 3) делаем NOT NULL
ALTER TABLE "OrderTtn"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "OrderTtnItem" (
    "id" TEXT NOT NULL,
    "ttnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qtyShipped" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTtnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderTtnItem_ttnId_idx" ON "OrderTtnItem"("ttnId");
CREATE INDEX "OrderTtnItem_orderItemId_idx" ON "OrderTtnItem"("orderItemId");
CREATE UNIQUE INDEX "OrderTtnItem_ttnId_orderItemId_key" ON "OrderTtnItem"("ttnId", "orderItemId");

-- AddForeignKey
ALTER TABLE "OrderTtnItem"
ADD CONSTRAINT "OrderTtnItem_ttnId_fkey"
FOREIGN KEY ("ttnId") REFERENCES "OrderTtn"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderTtnItem"
ADD CONSTRAINT "OrderTtnItem_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
