import { Module } from "@nestjs/common";
import { TelegramModule } from "../integrations/telegram/telegram.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsDeliveryService } from "./notifications-delivery.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { OrderWarehouseNotifierService } from "./order-warehouse-notifier.service";

@Module({
  imports: [PrismaModule, TelegramModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, OrderWarehouseNotifierService, NotificationsDeliveryService],
  exports: [NotificationsService, OrderWarehouseNotifierService, NotificationsDeliveryService],
})
export class NotificationsModule {}
