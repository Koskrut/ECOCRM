-- Prevent duplicate inserts for Expo rows with NULL deviceId during retries.
-- Keep existing owner+device+sample unique semantics for non-null device IDs.
CREATE UNIQUE INDEX IF NOT EXISTS "FieldLocationSample_ownerId_sampleId_null_device_key"
  ON "FieldLocationSample"("ownerId", "sampleId")
  WHERE "sampleId" IS NOT NULL AND "deviceId" IS NULL;
