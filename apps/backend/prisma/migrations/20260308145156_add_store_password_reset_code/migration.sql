-- CreateTable
CREATE TABLE "StorePasswordResetCode" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePasswordResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorePasswordResetCode_customerId_idx" ON "StorePasswordResetCode"("customerId");

-- CreateIndex
CREATE INDEX "StorePasswordResetCode_expiresAt_idx" ON "StorePasswordResetCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "StorePasswordResetCode" ADD CONSTRAINT "StorePasswordResetCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
