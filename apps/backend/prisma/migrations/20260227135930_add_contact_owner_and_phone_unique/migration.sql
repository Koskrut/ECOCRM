-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "phoneNormalized" TEXT;

-- CreateIndex (multiple NULLs allowed; uniqueness only for non-NULL)
CREATE UNIQUE INDEX "Contact_phoneNormalized_key" ON "Contact"("phoneNormalized");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
