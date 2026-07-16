-- Zero phantom receivables debt on closed Bitrix-imported deals.
-- Bitrix legacy is informational only; operational CRM debt excludes legacySource=bitrix.

UPDATE "Order"
SET "debtAmount" = 0,
    "paidAmount" = "totalAmount"
WHERE "legacySource" = 'bitrix'
  AND "orderStage" IN ('COMPLETED', 'RECEIVED');

UPDATE "Order"
SET "debtAmount" = 0
WHERE "legacySource" = 'bitrix'
  AND "orderStage" IN ('CANCELED', 'REFUSED');
