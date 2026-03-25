-- Set 1C/Google Sheet external codes for default warehouses.
-- Idempotent update by seed ids, with fallback by names.

UPDATE "Warehouse"
SET "externalCode" = '000000190',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'seed-wh-dnipro'
   OR name = 'Днепр';

UPDATE "Warehouse"
SET "externalCode" = '000000051',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'seed-wh-lviv'
   OR name = 'Львов'
   OR name = 'Льво';

UPDATE "Warehouse"
SET "externalCode" = '000000126',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'seed-wh-odesa'
   OR name = 'Одесса'
   OR name = 'Одеса';
