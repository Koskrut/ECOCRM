-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 0;

-- Deduplicate sku so unique index can be created: keep first id per sku, suffix others with _id
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY sku ORDER BY id) AS rn
  FROM "Product"
)
UPDATE "Product" p
SET sku = p.sku || '_' || p.id
FROM ranked r
WHERE r.id = p.id AND r.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku");
