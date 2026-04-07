import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RingostatBackfillService } from "./ringostat-backfill.service";
import { RingostatController } from "./ringostat.controller";
import { RingostatIngestService } from "./ringostat-ingest.service";
import { RingostatPollingService } from "./ringostat-polling.service";
import { RingostatReconcileService } from "./ringostat-reconcile.service";
import { RingostatRekeyUniqueidService } from "./ringostat-rekey-uniqueid.service";
import { RingostatRecordingsRefreshService } from "./ringostat-recordings-refresh.service";

@Module({
  imports: [PrismaModule],
  controllers: [RingostatController],
  providers: [
    RingostatIngestService,
    RingostatPollingService,
    RingostatBackfillService,
    RingostatReconcileService,
    RingostatRekeyUniqueidService,
    RingostatRecordingsRefreshService,
  ],
  exports: [
    RingostatBackfillService,
    RingostatReconcileService,
    RingostatRekeyUniqueidService,
    RingostatRecordingsRefreshService,
  ],
})
export class RingostatModule {}

