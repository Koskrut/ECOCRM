-- CreateEnum
CREATE TYPE "FieldShiftAnchorKind" AS ENUM ('HOME', 'CURRENT');

-- AlterTable
ALTER TABLE "FieldShift"
  ADD COLUMN "originKind" "FieldShiftAnchorKind",
  ADD COLUMN "originLat" DOUBLE PRECISION,
  ADD COLUMN "originLng" DOUBLE PRECISION,
  ADD COLUMN "destinationKind" "FieldShiftAnchorKind",
  ADD COLUMN "destinationLat" DOUBLE PRECISION,
  ADD COLUMN "destinationLng" DOUBLE PRECISION;

-- Backfill origin: HOME from profile routeStart when present, else CURRENT from first GPS sample.
UPDATE "FieldShift" AS fs
SET
  "originKind" = 'HOME',
  "originLat" = u."routeStartLat",
  "originLng" = u."routeStartLng"
FROM "User" AS u
WHERE fs."ownerId" = u.id
  AND fs."originKind" IS NULL
  AND u."routeStartLat" IS NOT NULL
  AND u."routeStartLng" IS NOT NULL;

UPDATE "FieldShift" AS fs
SET
  "originKind" = 'CURRENT',
  "originLat" = first_sample.lat,
  "originLng" = first_sample.lng
FROM (
  SELECT DISTINCT ON (s."shiftId")
    s."shiftId",
    s.lat,
    s.lng
  FROM "FieldLocationSample" AS s
  ORDER BY s."shiftId", s."clientRecordedAt" ASC
) AS first_sample
WHERE fs.id = first_sample."shiftId"
  AND fs."originKind" IS NULL;

-- Backfill destination only for ENDED shifts.
-- HOME when last GPS within ~1 km of garage (routeEnd else routeStart); else CURRENT from last GPS.
WITH garage AS (
  SELECT
    u.id AS "ownerId",
    COALESCE(u."routeEndLat", u."routeStartLat") AS glat,
    COALESCE(u."routeEndLng", u."routeStartLng") AS glng
  FROM "User" AS u
),
last_sample AS (
  SELECT DISTINCT ON (s."shiftId")
    s."shiftId",
    s.lat,
    s.lng
  FROM "FieldLocationSample" AS s
  ORDER BY s."shiftId", s."clientRecordedAt" DESC
)
UPDATE "FieldShift" AS fs
SET
  "destinationKind" = CASE
    WHEN g.glat IS NOT NULL
      AND g.glng IS NOT NULL
      AND ls.lat IS NOT NULL
      AND (
        6371000 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ls.lat - g.glat) / 2), 2)
          + COS(RADIANS(g.glat)) * COS(RADIANS(ls.lat))
            * POWER(SIN(RADIANS(ls.lng - g.glng) / 2), 2)
        ))
      ) <= 1000
    THEN 'HOME'::"FieldShiftAnchorKind"
    WHEN ls.lat IS NOT NULL THEN 'CURRENT'::"FieldShiftAnchorKind"
    WHEN g.glat IS NOT NULL THEN 'HOME'::"FieldShiftAnchorKind"
    ELSE NULL
  END,
  "destinationLat" = CASE
    WHEN g.glat IS NOT NULL
      AND g.glng IS NOT NULL
      AND ls.lat IS NOT NULL
      AND (
        6371000 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ls.lat - g.glat) / 2), 2)
          + COS(RADIANS(g.glat)) * COS(RADIANS(ls.lat))
            * POWER(SIN(RADIANS(ls.lng - g.glng) / 2), 2)
        ))
      ) <= 1000
    THEN g.glat
    WHEN ls.lat IS NOT NULL THEN ls.lat
    WHEN g.glat IS NOT NULL THEN g.glat
    ELSE NULL
  END,
  "destinationLng" = CASE
    WHEN g.glat IS NOT NULL
      AND g.glng IS NOT NULL
      AND ls.lat IS NOT NULL
      AND (
        6371000 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ls.lat - g.glat) / 2), 2)
          + COS(RADIANS(g.glat)) * COS(RADIANS(ls.lat))
            * POWER(SIN(RADIANS(ls.lng - g.glng) / 2), 2)
        ))
      ) <= 1000
    THEN g.glng
    WHEN ls.lng IS NOT NULL THEN ls.lng
    WHEN g.glng IS NOT NULL THEN g.glng
    ELSE NULL
  END
FROM garage AS g
LEFT JOIN last_sample AS ls ON ls."shiftId" = fs.id
WHERE fs."ownerId" = g."ownerId"
  AND fs.status = 'ENDED'
  AND fs."destinationKind" IS NULL;
