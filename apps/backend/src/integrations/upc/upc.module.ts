import { Module, OnModuleInit, forwardRef } from "@nestjs/common";
import { BankModule } from "../../bank/bank.module";
import { BankProviderRegistry } from "../../bank/bank-provider.registry";
import { PrismaModule } from "../../prisma/prisma.module";
import { UpcAisClient } from "./upc-ais.client";
import { UpcConsentController } from "./upc-consent.controller";
import { UpcConsentService } from "./upc-consent.service";
import { UpcHttpClient } from "./upc-http.client";
import { UpcSettingsController } from "./upc-settings.controller";
import { UpcProvider } from "./upc.provider";

@Module({
  imports: [PrismaModule, forwardRef(() => BankModule)],
  controllers: [UpcSettingsController, UpcConsentController],
  providers: [UpcHttpClient, UpcAisClient, UpcConsentService, UpcProvider],
  exports: [UpcProvider, UpcConsentService],
})
export class UpcModule implements OnModuleInit {
  constructor(
    private readonly registry: BankProviderRegistry,
    private readonly provider: UpcProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register("UPC", this.provider);
  }
}
