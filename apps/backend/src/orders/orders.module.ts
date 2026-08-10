import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuditModule } from "../audit/audit.module";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrderReturnsModule } from "../order-returns/order-returns.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentRequestsModule } from "../payment-requests/payment-requests.module";
import { SettingsModule } from "../settings/settings.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { RiskModule } from "../risk/risk.module";
import { SystemModule } from "../system/system.module";
import { OrdersController } from "./orders.controller";
import { OrdersDocumentsService } from "./orders-documents.service";
import { OrdersPickupAutoShipCron } from "./orders-pickup-auto-ship.cron";
import { OrdersPipelineConfigService } from "./pipeline/orders-pipeline-config.service";
import { OrderMaterialReservationModule } from "./order-material-reservation.module";
import { OrdersService } from "./orders.service";
import { FxVarianceService } from "./fx-variance.service";
import { OrderStatusService } from "./order-status.service";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    PaymentRequestsModule,
    WarehousesModule,
    SettingsModule,
    IntegrationPortsModule,
    OrderReturnsModule,
    WorkflowsModule,
    NotificationsModule,
    RiskModule,
    SystemModule,
    OrderMaterialReservationModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    FxVarianceService,
    OrderStatusService,
    OrdersDocumentsService,
    OrdersPipelineConfigService,
    OrdersPickupAutoShipCron,
  ],
  exports: [OrdersService, OrderMaterialReservationModule],
})
export class OrdersModule {}
