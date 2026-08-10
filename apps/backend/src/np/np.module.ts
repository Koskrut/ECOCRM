// src/np/np.module.ts
import { forwardRef, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { OrderMaterialReservationModule } from "../orders/order-material-reservation.module";
import { OrderReturnsModule } from "../order-returns/order-returns.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsServiceModule } from "../settings/settings-service.module";
import { SystemModule } from "../system/system.module";

import { NpClient } from "./np-client.service";
import { NpSyncService } from "./np-sync.service";
import { NpTtnService } from "./np-ttn.service";
import { NpSyncCron } from "./np-sync.cron";
import { NpTtnCron } from "./np-ttn.cron";
import { NpController } from "./np.controller";
import { NpTtnController } from "./np-ttn.controller";
import { NpIntegrationAdapter } from "./np-integration.adapter";
import { StoreNpController } from "../store/np/store-np.controller";

@Module({
  imports: [
    PrismaModule,
    IntegrationPortsModule,
    SystemModule,
    ScheduleModule.forRoot(),
    SettingsServiceModule,
    OrderMaterialReservationModule,
    forwardRef(() => OrderReturnsModule),
  ],
  controllers: [
    NpController, // /np/cities /np/warehouses /np/streets /np/sync
    NpTtnController, // /np/ttn/:orderId + /np/sender/check
    StoreNpController, // /store/np/* (catalog search for checkout)
  ],
  providers: [NpClient, NpTtnService, NpSyncService, NpSyncCron, NpTtnCron, NpIntegrationAdapter],
  exports: [NpTtnService, NpSyncService, NpClient],
})
export class NpModule {}
