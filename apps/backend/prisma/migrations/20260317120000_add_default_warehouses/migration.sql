-- Default warehouses (Днепр, Одесса, Львов) for shipping dropdown. Idempotent.
INSERT INTO "Warehouse" (id, name, "sortOrder", "createdAt", "updatedAt")
VALUES
  ('seed-wh-dnipro', 'Днепр', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-wh-odesa', 'Одесса', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-wh-lviv', 'Львов', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
