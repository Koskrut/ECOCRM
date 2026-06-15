import { Module } from "@nestjs/common";
import { NotificationsModule } from "../../notifications/notifications.module";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsServiceModule } from "../../settings/settings-service.module";
import { SystemModule } from "../../system/system.module";
import { RingostatBackfillService } from "./ringostat-backfill.service";
import { RingostatController } from "./ringostat.controller";
import { RingostatIngestService } from "./ringostat-ingest.service";
import { RingostatPollingService } from "./ringostat-polling.service";
import { RingostatReconcileService } from "./ringostat-reconcile.service";
import { RingostatRekeyUniqueidService } from "./ringostat-rekey-uniqueid.service";
import { RingostatRecordingsRefreshService } from "./ringostat-recordings-refresh.service";
import { RingostatLeadsRetrofitService } from "./ringostat-leads-retrofit.service";
import { RingostatSettingsController } from "./ringostat-settings.controller";

@Module({
  imports: [PrismaModule, SettingsServiceModule, SystemModule, NotificationsModule],
  controllers: [RingostatController, RingostatSettingsController],
  providers: [
    PhoneEntityLookupService,
    RingostatIngestService,
    RingostatPollingService,
    RingostatBackfillService,
    RingostatReconcileService,
    RingostatRekeyUniqueidService,
    RingostatRecordingsRefreshService,
    RingostatLeadsRetrofitService,
  ],
  exports: [
    RingostatBackfillService,
    RingostatReconcileService,
    RingostatRekeyUniqueidService,
    RingostatRecordingsRefreshService,
    RingostatLeadsRetrofitService,
  ],
})
export class RingostatModule {}

