-- CreditProfile must reference exactly one of contact or company
DELETE FROM "CreditProfile" WHERE "contactId" IS NULL AND "companyId" IS NULL;

UPDATE "CreditProfile"
SET "companyId" = NULL
WHERE "contactId" IS NOT NULL AND "companyId" IS NOT NULL;

ALTER TABLE "CreditProfile"
ADD CONSTRAINT "CreditProfile_contact_xor_company"
CHECK (
  ("contactId" IS NOT NULL AND "companyId" IS NULL)
  OR ("contactId" IS NULL AND "companyId" IS NOT NULL)
);
