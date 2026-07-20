-- Ensure at most one ACTIVE FieldShift per (ownerId, date) before unique index.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "ownerId", "date" ORDER BY "startedAt" DESC) AS rn
  FROM "FieldShift"
  WHERE status = 'ACTIVE'
)
UPDATE "FieldShift"
SET status = 'ENDED',
    "endedAt" = COALESCE("endedAt", NOW())
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "FieldShift_ownerId_date_active_uidx"
ON "FieldShift" ("ownerId", "date")
WHERE status = 'ACTIVE';
