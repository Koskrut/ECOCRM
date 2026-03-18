import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OrderReturnsController } from "./order-returns.controller";
import { OrderReturnsService } from "./order-returns.service";

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [OrderReturnsController],
  providers: [OrderReturnsService],
  exports: [OrderReturnsService],
})
export class OrderReturnsModule {}
