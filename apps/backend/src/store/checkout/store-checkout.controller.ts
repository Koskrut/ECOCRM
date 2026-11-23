import { BadRequestException, Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { notifyMetaPurchase } from "../../integrations/meta-conversions/meta-conversions.events";
import { clientIpFromRequest, headerValue } from "../../integrations/meta-conversions/meta-conversions.match";
import { MetaConversionsService } from "../../integrations/meta-conversions/meta-conversions.service";
import type { PurchaseInput } from "../../integrations/meta-conversions/meta-conversions.types";
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

function metaPurchaseContext(
  req: RequestWithStoreTg,
  dto: StoreCheckoutDto,
  result: {
    orderId: string;
    value: number;
    currency: string;
    contactId: string;
    city?: string;
    contents?: Array<{ id: string; quantity: number; itemPrice?: number | null }>;
  },
  channel: "website" | "telegram",
): PurchaseInput {
  return {
    orderId: result.orderId,
    value: result.value,
    currency: result.currency,
    channel,
    phone: dto.phone,
    email: dto.email,
    firstName: dto.firstName,
    lastName: dto.lastName,
    externalId: result.contactId,
    country: "ua",
    city: result.city || dto.deliveryData?.cityName,
    region: dto.region,
    contents: result.contents,
    clientIpAddress: clientIpFromRequest(req),
    clientUserAgent: headerValue(req.headers["user-agent"]),
    fbp: dto.fbp,
    fbc: dto.fbc,
    fbclid: dto.fbclid,
    eventSourceUrl: dto.eventSourceUrl,
  };
}

@Controller("store/checkout")
export class StoreCheckoutController {
  constructor(
    private readonly storeCheckout: StoreCheckoutService,
    private readonly storeCheckoutPaymentLink: StoreCheckoutPaymentLinkService,
    private readonly metaConversions: MetaConversionsService,
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
      const linkedContactId = await this.storeCheckout.linkedContactIdForTelegramUser(storeTg.sub);
      const result = await this.storeCheckout.checkout(dto, {
        autoCreateCustomer: true,
        forContactId: linkedContactId,
      });
      if (result.currency) {
        void notifyMetaPurchase(this.metaConversions, metaPurchaseContext(req, dto, result, "telegram"));
      }
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

    const result = await this.storeCheckout.checkout(dto);
    if (result.currency) {
      void notifyMetaPurchase(this.metaConversions, metaPurchaseContext(req, dto, result, "website"));
    }
    return result;
  }

  /** Публічне посилання на оплату після оформлення (JWT з відповіді checkout). */
  @Post("payment-link")
  createPaymentLink(@Body() body: StoreCheckoutPaymentLinkDto) {
    return this.storeCheckoutPaymentLink.createPaymentLink(body.token);
  }
}
