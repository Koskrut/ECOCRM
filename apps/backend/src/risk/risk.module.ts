import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../prisma/prisma.module";
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
  imports: [PrismaModule, RbacModule, SystemModule, ScheduleModule.forRoot()],
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
