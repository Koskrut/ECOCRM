import { Module, forwardRef } from "@nestjs/common";
import { BankModule } from "../bank/bank.module";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { PaymentsIntegrationAdapter } from "./payments-integration.adapter";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [PrismaModule, SettingsModule, IntegrationPortsModule, forwardRef(() => BankModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsIntegrationAdapter],
  exports: [PaymentsService],
})
export class PaymentsModule {}
