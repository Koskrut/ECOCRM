-- Add Kyiv, Lutsk, Khmelnytskyi warehouses for stock-by-warehouse Excel import.
INSERT INTO "Warehouse" (id, name, "sortOrder", "createdAt", "updatedAt")
VALUES
  ('seed-wh-kyiv', 'Киев', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-wh-lutsk', 'Луцьк', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-wh-khmelnitsky', 'Хмельницький', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
