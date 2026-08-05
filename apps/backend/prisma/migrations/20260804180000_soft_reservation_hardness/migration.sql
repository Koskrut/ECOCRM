-- Align ACTIVE reservation hardness with order stage (NEW/AWAITING_PAYMENT → SOFT).
UPDATE "MaterialReservation" r
SET "hardness" = 'SOFT', "updatedAt" = CURRENT_TIMESTAMP
FROM "Order" o
WHERE r."orderId" = o."id"
  AND r."status" = 'ACTIVE'
  AND o."orderStage" IN ('NEW', 'AWAITING_PAYMENT')
  AND r."hardness" = 'HARD';
