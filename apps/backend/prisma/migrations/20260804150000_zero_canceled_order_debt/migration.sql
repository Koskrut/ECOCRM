-- Canceled orders must not contribute to client receivables.
-- Preserve prepayments as order credit instead of phantom debt.

UPDATE "Order"
SET "debtAmount" = 0,
    "creditAmount" = GREATEST("creditAmount", "paidAmount"),
    "financialStatus" = 'CLOSED'
WHERE "orderStage" = 'CANCELED'
  AND "debtAmount" > 0;
