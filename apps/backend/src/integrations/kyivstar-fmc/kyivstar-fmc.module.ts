import { Module } from "@nestjs/common";
import { ManualCallingModule } from "../../manual-calling/manual-calling.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsServiceModule } from "../../settings/settings-service.module";
import { SystemModule } from "../../system/system.module";
import { KyivstarFmcBackfillService } from "./kyivstar-fmc-backfill.service";
import { KyivstarFmcController } from "./kyivstar-fmc.controller";
import { KyivstarFmcIngestService } from "./kyivstar-fmc-ingest.service";
import { KyivstarFmcPollingService } from "./kyivstar-fmc-polling.service";
import { KyivstarFmcSettingsController } from "./kyivstar-fmc-settings.controller";
import { KyivstarFmcWorkspaceService } from "./kyivstar-fmc-workspace.service";

@Module({
  imports: [PrismaModule, SettingsServiceModule, SystemModule, NotificationsModule, ManualCallingModule],
  controllers: [KyivstarFmcController, KyivstarFmcSettingsController],
  providers: [
    PhoneEntityLookupService,
    KyivstarFmcIngestService,
    KyivstarFmcPollingService,
    KyivstarFmcBackfillService,
    KyivstarFmcWorkspaceService,
  ],
  exports: [KyivstarFmcBackfillService],
})
export class KyivstarFmcModule {}
