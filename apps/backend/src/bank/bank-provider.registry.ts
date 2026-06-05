import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { BankProvider } from "@prisma/client";
import { ModuleStateService } from "../modules/module-state.service";
import { BANK_PROVIDER_MODULE } from "./bank-provider-modules";
import type { BankStatementProvider } from "./providers/types";

@Injectable()
export class BankProviderRegistry {
  private readonly providers = new Map<BankProvider, BankStatementProvider>();

  constructor(@Inject(ModuleStateService) private readonly modules: ModuleStateService) {}

  register(provider: BankProvider, impl: BankStatementProvider): void {
    this.providers.set(provider, impl);
  }

  get(provider: BankProvider): BankStatementProvider | undefined {
    return this.providers.get(provider);
  }

  listRegistered(): BankProvider[] {
    return [...this.providers.keys()];
  }

  async isProviderLicensed(provider: BankProvider): Promise<boolean> {
    if (process.env.MODULE_GATING_ENABLED !== "true") return true;
    const moduleId = BANK_PROVIDER_MODULE[provider];
    return this.modules.isEffective(moduleId);
  }

  async assertProviderLicensed(provider: BankProvider): Promise<void> {
    const ok = await this.isProviderLicensed(provider);
    if (!ok) {
      throw new BadRequestException(`Bank provider ${provider} is not licensed or enabled`);
    }
  }

  async listLicensedProviders(): Promise<BankProvider[]> {
    const licensed: BankProvider[] = [];
    for (const provider of this.listRegistered()) {
      if (await this.isProviderLicensed(provider)) {
        licensed.push(provider);
      }
    }
    return licensed;
  }
}
