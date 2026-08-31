-- CreateEnum
CREATE TYPE "FieldShiftMobilityMode" AS ENUM ('CAR', 'WALK_TRANSIT');

-- AlterTable
ALTER TABLE "FieldShift" ADD COLUMN "mobilityMode" "FieldShiftMobilityMode" NOT NULL DEFAULT 'CAR';
ALTER TABLE "FieldShift" ADD COLUMN "mobilityNote" TEXT;
