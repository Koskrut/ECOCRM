import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderStatusService } from "./order-status.service";

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService],
  exports: [OrdersService],
})
export class OrdersModule {}
