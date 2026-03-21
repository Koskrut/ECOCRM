-- Idempotent: local DB may already have these columns (drift / manual / prior partial apply).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "routeEndLabel" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "routeEndLat" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "routeEndLng" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "routeStartLabel" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "routeStartLat" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "routeStartLng" DOUBLE PRECISION;

ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "purpose" TEXT;

CREATE INDEX IF NOT EXISTS "User_leadId_idx" ON "User"("leadId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_leadId_fkey'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
