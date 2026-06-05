import { Module, OnModuleInit, forwardRef } from "@nestjs/common";
import { BankModule } from "../../bank/bank.module";
import { BankProviderRegistry } from "../../bank/bank-provider.registry";
import { PrismaModule } from "../../prisma/prisma.module";
import { Privat24AccountsController } from "./privat24-accounts.controller";
import { Privat24Provider } from "./privat24.provider";
import { Privat24RequisitesService } from "./privat24-requisites.service";

@Module({
  imports: [PrismaModule, forwardRef(() => BankModule)],
  controllers: [Privat24AccountsController],
  providers: [Privat24Provider, Privat24RequisitesService],
  exports: [Privat24Provider, Privat24RequisitesService],
})
export class Privat24Module implements OnModuleInit {
  constructor(
    private readonly registry: BankProviderRegistry,
    private readonly provider: Privat24Provider,
  ) {}

  onModuleInit(): void {
    this.registry.register("PRIVAT24", this.provider);
  }
}
