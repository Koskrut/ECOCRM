-- Failed-attempt counter for CRM and store password reset codes.
ALTER TABLE "PasswordResetCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StorePasswordResetCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
