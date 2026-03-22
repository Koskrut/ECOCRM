import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { StoreCheckoutPaymentLinkDto } from "./dto/store-checkout-payment-link.dto";
import { StoreCheckoutService } from "./store-checkout.service";
import { StoreCheckoutPaymentLinkService } from "./store-checkout-payment-link.service";
import { StoreCheckoutDto } from "./dto/store-checkout.dto";
import { UKRAINE_REGIONS } from "./uk-regions";

@Controller("store/checkout")
export class StoreCheckoutController {
  constructor(
    private readonly storeCheckout: StoreCheckoutService,
    private readonly storeCheckoutPaymentLink: StoreCheckoutPaymentLinkService,
  ) {}

  /** Повний перелік областей України (не залежить від org-chart). */
  @Get("regions")
  getRegions() {
    return { items: [...UKRAINE_REGIONS] };
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

  /** Публічне посилання на оплату після оформлення (JWT з відповіді checkout). */
  @Post("payment-link")
  createPaymentLink(@Body() body: StoreCheckoutPaymentLinkDto) {
    return this.storeCheckoutPaymentLink.createPaymentLink(body.token);
  }
}
