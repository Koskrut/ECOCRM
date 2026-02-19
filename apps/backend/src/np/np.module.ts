// src/np/np.module.ts
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../prisma/prisma.module";

import { NpClient } from "./np-client.service";
import { NpSyncService } from "./np-sync.service";
import { NpTtnService } from "./np-ttn.service";
import { NpSyncCron } from "./np-sync.cron";
import { NpTtnCron } from "./np-ttn.cron";
import { NpController } from "./np.controller";
import { NpTtnController } from "./np-ttn.controller";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [
    NpController, // /np/cities /np/warehouses /np/streets /np/sync
    NpTtnController, // /np/ttn/:orderId + /np/sender/check
  ],
  providers: [NpClient, NpTtnService, NpSyncService, NpSyncCron, NpTtnCron],
  exports: [NpTtnService, NpSyncService],
})
export class NpModule {}
