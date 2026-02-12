import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NpModule } from "../np/np.module";
import { OrderStatusService } from "./order-status.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    ActivitiesModule,
    PrismaModule, // ✅ чтобы OrdersService получал PrismaService
    NpModule,     // ✅ чтобы OrdersController получал NpTtnService
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService],
  exports: [OrdersService],
})
export class OrdersModule {}
