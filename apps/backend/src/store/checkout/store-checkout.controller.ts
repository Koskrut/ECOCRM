import { Body, Controller, Post, Query } from "@nestjs/common";
import { StoreCheckoutService } from "./store-checkout.service";
import type { StoreCheckoutDto } from "./dto/store-checkout.dto";

@Controller("store/checkout")
export class StoreCheckoutController {
  constructor(private readonly storeCheckout: StoreCheckoutService) {}

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
