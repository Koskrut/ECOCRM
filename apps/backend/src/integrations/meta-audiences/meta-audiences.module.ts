import { Module } from "@nestjs/common";
import { SettingsServiceModule } from "../../settings/settings-service.module";
import { MetaAudiencesController } from "./meta-audiences.controller";
import { MetaAudiencesCron } from "./meta-audiences.cron";
import { MetaAudiencesService } from "./meta-audiences.service";

@Module({
  imports: [SettingsServiceModule],
  controllers: [MetaAudiencesController],
  providers: [MetaAudiencesService, MetaAudiencesCron],
})
export class MetaAudiencesModule {}
