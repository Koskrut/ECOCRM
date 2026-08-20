import { Module, forwardRef } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { BankModule } from "../bank/bank.module";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { SystemModule } from "../system/system.module";
import { PaymentsIntegrationAdapter } from "./payments-integration.adapter";
import { PaymentsController } from "./payments.controller";
import { PaymentsFinancialStatusCron } from "./payments-financial-status.cron";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    SystemModule,
    IntegrationPortsModule,
    AuditModule,
    forwardRef(() => BankModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsIntegrationAdapter, PaymentsFinancialStatusCron],
  exports: [PaymentsService],
})
export class PaymentsModule {}
