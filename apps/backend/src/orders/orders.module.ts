import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { OrderStatusService } from "./order-status.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ActivitiesModule } from "../activities/activities.module";

@Module({
  imports: [ActivitiesModule],
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
