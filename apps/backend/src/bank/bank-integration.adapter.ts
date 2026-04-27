import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import { BankAccountsService } from "./bank-accounts.service";

@Injectable()
export class BankIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    @Inject(BankAccountsService) private readonly bankAccounts: BankAccountsService,
  ) {}

  onModuleInit(): void {
    this.ports.registerStoreBankAccount(this);
  }

  resolveStoreDefaultBankAccountIdForCheckout() {
    return this.bankAccounts.resolveStoreDefaultBankAccountIdForCheckout();
  }
}
