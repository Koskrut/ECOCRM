-- Bonus threshold is denominated in USD (was named *Uah by mistake).
ALTER TABLE "UserPayrollProfile" RENAME COLUMN "bonusThresholdUah" TO "bonusThresholdUsd";
