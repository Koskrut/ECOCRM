-- CreateTable
CREATE TABLE "OrderItemSerial" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "serialKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "OrderItemSerial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderItemSerial_serialKey_key" ON "OrderItemSerial"("serialKey");

-- CreateIndex
CREATE INDEX "OrderItemSerial_orderItemId_idx" ON "OrderItemSerial"("orderItemId");

-- AddForeignKey
ALTER TABLE "OrderItemSerial" ADD CONSTRAINT "OrderItemSerial_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
