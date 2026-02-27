-- Add ownerId to Order if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Order' AND column_name = 'ownerId') THEN
    ALTER TABLE "Order" ADD COLUMN "ownerId" TEXT;
    UPDATE "Order" SET "ownerId" = (SELECT id FROM "User" LIMIT 1) WHERE "ownerId" IS NULL;
    ALTER TABLE "Order" ALTER COLUMN "ownerId" SET NOT NULL;
    CREATE INDEX "Order_ownerId_idx" ON "Order"("ownerId");
    ALTER TABLE "Order" ADD CONSTRAINT "Order_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
