import { Module, forwardRef } from "@nestjs/common";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { ClientBalancesController } from "./client-balances.controller";
import { ClientBalancesIntegrationAdapter } from "./client-balances-integration.adapter";
import { ClientBalancesService } from "./client-balances.service";

@Module({
  imports: [PrismaModule, SettingsModule, IntegrationPortsModule, forwardRef(() => PaymentsModule)],
  controllers: [ClientBalancesController],
  providers: [ClientBalancesService, ClientBalancesIntegrationAdapter],
  exports: [ClientBalancesService],
})
export class ClientBalancesModule {}
