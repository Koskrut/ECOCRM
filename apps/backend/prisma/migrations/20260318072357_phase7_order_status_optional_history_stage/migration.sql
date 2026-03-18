-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "status" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "fromOrderStage" "OrderStage",
ADD COLUMN     "toOrderStage" "OrderStage";

-- CreateIndex
CREATE INDEX "OrderStatusHistory_toOrderStage_idx" ON "OrderStatusHistory"("toOrderStage");
