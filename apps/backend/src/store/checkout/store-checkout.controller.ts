import { BadRequestException, Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { StoreCheckoutPaymentLinkDto } from "./dto/store-checkout-payment-link.dto";
import { StoreCheckoutService } from "./store-checkout.service";
import { StoreCheckoutPaymentLinkService } from "./store-checkout-payment-link.service";
import { StoreCheckoutDto } from "./dto/store-checkout.dto";
import { UKRAINE_REGIONS } from "./uk-regions";
import {
  isTelegramCartSessionId,
  readStoreTelegramWebAppJwt,
  type RequestWithStoreTg,
} from "../telegram/store-telegram-webapp.util";

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
    @Req() req: RequestWithStoreTg,
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

    const storeTg = readStoreTelegramWebAppJwt(req);
    if (storeTg) {
      dto = {
        ...dto,
        sessionId: storeTg.cartSessionId,
        phone: (dto.phone ?? "").trim() || storeTg.phone || dto.phone,
        firstName:
          (dto.firstName ?? (dto as { name?: string }).name ?? "").toString().trim() ||
          storeTg.firstName ||
          undefined,
        lastName: (dto.lastName ?? "").trim() || storeTg.lastName || undefined,
      };
      const result = await this.storeCheckout.checkout(dto, { autoCreateCustomer: true });
      void this.storeCheckout.notifyTelegramWebAppOrder({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        contactId: result.contactId,
        telegramUserId: storeTg.sub,
        chatId: storeTg.chatId,
        orderPayToken: result.orderPayToken,
      });
      return result;
    }

    if (isTelegramCartSessionId(dto.sessionId)) {
      throw new BadRequestException("Telegram checkout requires a signed Mini App session");
    }

    return this.storeCheckout.checkout(dto);
  }

  /** Публічне посилання на оплату після оформлення (JWT з відповіді checkout). */
  @Post("payment-link")
  createPaymentLink(@Body() body: StoreCheckoutPaymentLinkDto) {
    return this.storeCheckoutPaymentLink.createPaymentLink(body.token);
  }
}
