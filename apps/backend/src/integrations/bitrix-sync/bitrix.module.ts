import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { BitrixClient } from "./bitrix.client";
import { BitrixDeltaSyncService } from "./bitrix.delta-sync.service";
import { BitrixInitialImportService } from "./bitrix.initial-import.service";
import { BitrixSyncStateService } from "./bitrix.sync-state.service";

@Module({
  imports: [PrismaModule],
  providers: [
    BitrixSyncStateService,
    BitrixInitialImportService,
    { provide: BitrixClient, useFactory: () => new BitrixClient() },
    BitrixDeltaSyncService,
  ],
  exports: [BitrixSyncStateService, BitrixInitialImportService, BitrixClient, BitrixDeltaSyncService],
})
export class BitrixSyncModule {}
