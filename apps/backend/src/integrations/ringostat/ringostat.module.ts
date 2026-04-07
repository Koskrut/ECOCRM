import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RingostatBackfillService } from "./ringostat-backfill.service";
import { RingostatController } from "./ringostat.controller";
import { RingostatIngestService } from "./ringostat-ingest.service";
import { RingostatPollingService } from "./ringostat-polling.service";
import { RingostatReconcileService } from "./ringostat-reconcile.service";
import { RingostatRekeyUniqueidService } from "./ringostat-rekey-uniqueid.service";

@Module({
  imports: [PrismaModule],
  controllers: [RingostatController],
  providers: [
    RingostatIngestService,
    RingostatPollingService,
    RingostatBackfillService,
    RingostatReconcileService,
    RingostatRekeyUniqueidService,
  ],
  exports: [RingostatBackfillService, RingostatReconcileService, RingostatRekeyUniqueidService],
})
export class RingostatModule {}

