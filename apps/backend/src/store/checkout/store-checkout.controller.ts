import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { SettingsService } from "../../settings/settings.service";
import { StoreCheckoutService } from "./store-checkout.service";
import { StoreCheckoutDto } from "./dto/store-checkout.dto";

@Controller("store/checkout")
export class StoreCheckoutController {
  constructor(
    private readonly storeCheckout: StoreCheckoutService,
    private readonly settings: SettingsService,
  ) {}

  @Get("regions")
  async getRegions() {
    const org = await this.settings.getOrgChartStructure();
    const uniq = new Set<string>();
    for (const values of Object.values(org.regions ?? {})) {
      for (const region of values ?? []) {
        const v = String(region ?? "").trim();
        if (v) uniq.add(v);
      }
    }
    return { items: Array.from(uniq).sort((a, b) => a.localeCompare(b, "uk")) };
  }

  @Post()
  async runCheckout(
    @Body() dto: StoreCheckoutDto,
    @Query("sessionId") sessionIdFromQuery?: string,
    @Query("phone") phoneFromQuery?: string,
    @Query("firstName") firstNameFromQuery?: string,
  ) {
    if (sessionIdFromQuery?.trim() && !dto.sessionId?.trim()) {
      dto = { ...dto, sessionId: sessionIdFromQuery.trim() };
    }
    if (phoneFromQuery != null && !(dto.phone ?? "").trim()) {
      dto = { ...dto, phone: phoneFromQuery.trim() };
    }
    const fromBody = (dto.firstName ?? (dto as { name?: string }).name ?? "").trim();
    if (firstNameFromQuery?.trim() && !fromBody) {
      dto = { ...dto, firstName: firstNameFromQuery.trim() };
    }
    return this.storeCheckout.checkout(dto);
  }
}
