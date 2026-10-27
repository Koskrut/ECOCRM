import { forwardRef, Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { RbacModule } from "../rbac/rbac.module";
import { SystemModule } from "../system/system.module";
import { RiskCollectorsService } from "./risk-collectors.service";
import { RiskController } from "./risk.controller";
import { RiskCron } from "./risk.cron";
import { RiskEriService } from "./risk-eri.service";
import { RiskExposureService } from "./risk-exposure.service";
import { RiskMlChallengerService } from "./risk-ml-challenger.service";
import { RiskPlaybooksService } from "./risk-playbooks.service";
import { RiskPolicyService } from "./risk-policy.service";
import { RiskScorecardService } from "./risk-scorecard.service";
import { RiskService } from "./risk.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    RbacModule,
    SystemModule,
    // Notifications → Telegram → Store → Orders → Risk. The class is still undefined while that cycle loads.
    forwardRef(() => NotificationsModule),
  ],
  controllers: [RiskController],
  providers: [
    RiskService,
    RiskCollectorsService,
    RiskScorecardService,
    RiskExposureService,
    RiskPolicyService,
    RiskPlaybooksService,
    RiskEriService,
    RiskMlChallengerService,
    RiskCron,
  ],
  exports: [RiskService, RiskPolicyService, RiskExposureService],
})
export class RiskModule {}
