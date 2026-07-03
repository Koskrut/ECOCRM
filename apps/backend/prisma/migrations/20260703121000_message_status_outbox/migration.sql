-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: existing rows are already delivered, so default to SENT.
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "status" "MessageStatus" NOT NULL DEFAULT 'SENT';
