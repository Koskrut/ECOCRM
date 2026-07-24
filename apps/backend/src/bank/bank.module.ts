import { Module, forwardRef } from "@nestjs/common";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentsModule } from "../payments/payments.module";
import { SystemModule } from "../system/system.module";
import { BankIntegrationAdapter } from "./bank-integration.adapter";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { BankProviderRegistry } from "./bank-provider.registry";
import { BankSyncController } from "./bank-sync.controller";
import { BankSyncCron } from "./bank-sync.cron";
import { BankSyncService } from "./bank-sync.service";
import { BankTransactionsController } from "./bank-transactions.controller";
import { BankTransactionsService } from "./bank-transactions.service";
import { MatchEngineService } from "./match-engine.service";
import { MatchSuggestionService } from "./match-suggestion.service";
import { PayerAliasService } from "./payer-alias.service";
import { PayerAliasesController } from "./payer-aliases.controller";
import { PaymentMatchingService } from "./payment-matching.service";

@Module({
  imports: [PrismaModule, SystemModule, IntegrationPortsModule, forwardRef(() => PaymentsModule)],
  controllers: [
    BankAccountsController,
    BankSyncController,
    BankTransactionsController,
    PayerAliasesController,
  ],
  providers: [
    BankProviderRegistry,
    BankAccountsService,
    BankTransactionsService,
    BankSyncService,
    MatchSuggestionService,
    PayerAliasService,
    PaymentMatchingService,
    MatchEngineService,
    BankSyncCron,
    BankIntegrationAdapter,
  ],
  exports: [
    BankProviderRegistry,
    BankAccountsService,
    BankSyncService,
    MatchEngineService,
    MatchSuggestionService,
    PayerAliasService,
    PaymentMatchingService,
    BankTransactionsService,
  ],
})
export class BankModule {}
