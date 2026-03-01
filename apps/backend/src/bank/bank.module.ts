import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentsModule } from "../payments/payments.module";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { BankSyncController } from "./bank-sync.controller";
import { BankSyncCron } from "./bank-sync.cron";
import { BankSyncService } from "./bank-sync.service";
import { BankTransactionsController } from "./bank-transactions.controller";
import { BankTransactionsService } from "./bank-transactions.service";
import { MatchEngineService } from "./match-engine.service";

@Module({
  imports: [PrismaModule, forwardRef(() => PaymentsModule)],
  controllers: [
    BankAccountsController,
    BankSyncController,
    BankTransactionsController,
  ],
  providers: [
    BankAccountsService,
    BankTransactionsService,
    BankSyncService,
    MatchEngineService,
    BankSyncCron,
  ],
  exports: [BankAccountsService, BankSyncService, MatchEngineService, BankTransactionsService],
})
export class BankModule {}
