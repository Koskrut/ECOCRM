import { forwardRef, Module } from "@nestjs/common";
import { TelegramModule } from "../integrations/telegram/telegram.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { NotificationsDeliveryService } from "./notifications-delivery.service";
import { ExpoPushService } from "./expo-push.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { OrderSaleAssignedNotifierService } from "./order-sale-assigned-notifier.service";
import { OrderWarehouseNotifierService } from "./order-warehouse-notifier.service";

@Module({
  imports: [PrismaModule, SettingsModule, forwardRef(() => TelegramModule)],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    OrderWarehouseNotifierService,
    OrderSaleAssignedNotifierService,
    NotificationsDeliveryService,
    ExpoPushService,
  ],
  exports: [
    NotificationsService,
    OrderWarehouseNotifierService,
    OrderSaleAssignedNotifierService,
    NotificationsDeliveryService,
  ],
})
export class NotificationsModule {}
