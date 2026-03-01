-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PREPAYMENT', 'DEFERRED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentType" "PaymentType";
