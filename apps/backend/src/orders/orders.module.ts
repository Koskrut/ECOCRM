import { Module } from "@nestjs/common";
import { GoogleSheetModule } from "../integrations/google-sheet/google-sheet.module";
import { OrderReturnsModule } from "../order-returns/order-returns.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentsModule } from "../payments/payments.module";
import { PaymentRequestsModule } from "../payment-requests/payment-requests.module";
import { SettingsModule } from "../settings/settings.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { OrdersController } from "./orders.controller";
import { OrdersDocumentsService } from "./orders-documents.service";
import { OrdersService } from "./orders.service";
import { OrderStatusService } from "./order-status.service";

@Module({
  imports: [
    PrismaModule,
    PaymentsModule,
    PaymentRequestsModule,
    WarehousesModule,
    SettingsModule,
    GoogleSheetModule,
    OrderReturnsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService, OrdersDocumentsService],
  exports: [OrdersService],
})
export class OrdersModule {}
