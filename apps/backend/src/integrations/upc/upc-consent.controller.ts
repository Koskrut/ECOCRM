import { Controller, Get, Param, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { Public } from "../../auth/public.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { UpcConsentService } from "./upc-consent.service";

@Controller("integrations/upc/consent")
export class UpcConsentController {
  constructor(private readonly consent: UpcConsentService) {}

  @Get("start/:bankAccountId")
  @RequireModule(ModuleIds.Upc)
  @Roles(UserRole.ADMIN)
  start(@Param("bankAccountId") bankAccountId: string) {
    return this.consent.startConsent(bankAccountId);
  }

  @Get("status/:bankAccountId")
  @RequireModule(ModuleIds.Upc)
  @Roles(UserRole.ADMIN)
  status(@Param("bankAccountId") bankAccountId: string) {
    return this.consent.getConsentStatus(bankAccountId);
  }

  @Public()
  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string) {
    if (!code || !state) {
      return { error: "Missing code or state" };
    }
    return this.consent.handleCallback(code, state);
  }
}
