-- Align migration history with existing DB index (non-destructive).
CREATE INDEX IF NOT EXISTS "Order_ownerId_idx" ON "Order"("ownerId");
