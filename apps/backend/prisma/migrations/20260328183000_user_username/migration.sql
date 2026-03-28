-- AlterTable (idempotent: first run may have failed after this step)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- Backfill only rows without username; resolve collisions with numeric suffix
WITH norm AS (
  SELECT
    u.id,
    u.email,
    CASE
      WHEN length(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9._-]', '', 'g')) > 0
      THEN regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9._-]', '-', 'g')
      ELSE 'user-' || substring(replace(u.id::text, '-', ''), 1, 10)
    END AS base
  FROM "User" u
  WHERE u.username IS NULL
),
ranked AS (
  SELECT
    id,
    base,
    row_number() OVER (PARTITION BY base ORDER BY email) AS rn
  FROM norm
)
UPDATE "User" u
SET username = CASE
  WHEN r.rn = 1 THEN r.base
  ELSE r.base || '-' || r.rn::text
END
FROM ranked r
WHERE u.id = r.id AND u.username IS NULL;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
