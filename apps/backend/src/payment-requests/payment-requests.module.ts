import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentRequestsActionsController } from "./payment-requests-actions.controller";
import { PaymentRequestsService } from "./payment-requests.service";
import { PublicPaymentRequestsController } from "./public-payment-requests.controller";

@Module({
  imports: [PrismaModule],
  controllers: [PublicPaymentRequestsController, PaymentRequestsActionsController],
  providers: [PaymentRequestsService],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
