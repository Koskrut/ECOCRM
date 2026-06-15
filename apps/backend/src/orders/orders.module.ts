import { Module } from "@nestjs/common";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrderReturnsModule } from "../order-returns/order-returns.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentRequestsModule } from "../payment-requests/payment-requests.module";
import { SettingsModule } from "../settings/settings.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { OrdersController } from "./orders.controller";
import { OrdersDocumentsService } from "./orders-documents.service";
import { OrdersPipelineConfigService } from "./pipeline/orders-pipeline-config.service";
import { OrdersService } from "./orders.service";
import { OrderStatusService } from "./order-status.service";

@Module({
  imports: [
    PrismaModule,
    PaymentRequestsModule,
    WarehousesModule,
    SettingsModule,
    IntegrationPortsModule,
    OrderReturnsModule,
    WorkflowsModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService, OrdersDocumentsService, OrdersPipelineConfigService],
  exports: [OrdersService],
})
export class OrdersModule {}
