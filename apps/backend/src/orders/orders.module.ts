import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { OrderStatusService } from "./order-status.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderStatusService,
    {
      provide: PrismaClient,
      useFactory: createPrismaClient,
    },
  ],
})
export class OrdersModule {}
