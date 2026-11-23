import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { notifyMetaAddToCart } from "../../integrations/meta-conversions/meta-conversions.events";
import { clientIpFromRequest, headerValue } from "../../integrations/meta-conversions/meta-conversions.match";
import { MetaConversionsService } from "../../integrations/meta-conversions/meta-conversions.service";
import { SettingsService } from "../../settings/settings.service";
import {
  isTelegramCartSessionId,
  readStoreTelegramWebAppJwt,
  type RequestWithStoreTg,
} from "../telegram/store-telegram-webapp.util";
import { storeSpendPromoForSubtotal } from "../promo/store-spend-discount";
import { StoreCartService } from "./store-cart.service";

@Controller("store/cart")
export class StoreCartController {
  constructor(
    private readonly cart: StoreCartService,
    private readonly settings: SettingsService,
    private readonly metaConversions: MetaConversionsService,
  ) {}

  private getIdentity(req: RequestWithStoreTg): { customerId?: string; sessionId?: string } {
    if (req.customer) return { customerId: req.customer.customerId };

    const storeTg = readStoreTelegramWebAppJwt(req);
    if (storeTg) {
      req.storeTg = storeTg;
      return { sessionId: storeTg.cartSessionId };
    }

    const sessionId =
      (req.headers["x-store-cart-session"] as string) ||
      (req.body?.sessionId as string) ||
      (req.query?.sessionId as string);

    if (isTelegramCartSessionId(sessionId)) {
      throw new BadRequestException("Telegram cart requires a signed Mini App session");
    }

    return sessionId ? { sessionId } : {};
  }

  @Get()
  async get(@Req() req: RequestWithStoreTg) {
    const identity = this.getIdentity(req);
    if (!identity.customerId && !identity.sessionId) {
      const rates = await this.settings.getExchangeRates();
      const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
      const priced = storeSpendPromoForSubtotal(0);
      return {
        id: null,
        uahPerUsd,
        items: [],
        subtotal: 0,
        discountAmount: 0,
        total: 0,
        spendPromo: priced.promo,
      };
    }
    return this.cart.getCart(identity);
  }

  @Post("items")
  async addItem(
    @Req() req: RequestWithStoreTg,
    @Body()
    body: {
      productId: string;
      qty?: number;
      sessionId?: string;
      metaEventId?: string;
      fbp?: string;
      fbc?: string;
      fbclid?: string;
      eventSourceUrl?: string;
    },
  ) {
    const identity = this.getIdentity(req);
    if (body.sessionId && !identity.customerId && !identity.sessionId) {
      if (isTelegramCartSessionId(body.sessionId)) {
        throw new BadRequestException("Telegram cart requires a signed Mini App session");
      }
      (identity as { sessionId?: string }).sessionId = body.sessionId;
    }
    const productId = String(body.productId ?? "");
    const addedQty = Math.max(1, Math.floor(typeof body.qty === "number" ? body.qty : Number(body.qty) || 1));
    const cart = await this.cart.addItem(identity, productId, addedQty);
    const line = cart.items.find((item) => item.productId === productId);
    if (line) {
      const storeTg = readStoreTelegramWebAppJwt(req);
      void notifyMetaAddToCart(this.metaConversions, {
        eventId: body.metaEventId ?? "",
        contentId: line.sku || line.productId,
        contentName: line.name,
        quantity: addedQty,
        itemPrice: line.price,
        value: Math.round(line.price * addedQty * 100) / 100,
        currency: "USD",
        channel: storeTg ? "telegram" : "website",
        clientIpAddress: clientIpFromRequest(req),
        clientUserAgent: headerValue(req.headers["user-agent"]),
        fbp: body.fbp,
        fbc: body.fbc,
        fbclid: body.fbclid,
        eventSourceUrl: body.eventSourceUrl,
      });
    }
    return cart;
  }

  @Patch("items/:itemId")
  async updateItem(
    @Req() req: RequestWithStoreTg,
    @Param("itemId") itemId: string,
    @Body() body: { qty: number },
  ) {
    const identity = this.getIdentity(req);
    return this.cart.updateItemQty(identity, itemId, Number(body.qty) ?? 0);
  }

  @Delete("items/:itemId")
  async removeItem(@Req() req: RequestWithStoreTg, @Param("itemId") itemId: string) {
    const identity = this.getIdentity(req);
    return this.cart.removeItem(identity, itemId);
  }

  @Delete()
  async clear(@Req() req: RequestWithStoreTg) {
    const identity = this.getIdentity(req);
    return this.cart.clearCart(identity);
  }

  /** Pull guest (localStorage) lines into the signed Telegram cart after Mini App login. */
  @Post("merge-session")
  async mergeSession(
    @Req() req: RequestWithStoreTg,
    @Body() body: { fromSessionId?: string },
  ) {
    const identity = this.getIdentity(req);
    const toSessionId = identity.sessionId;
    if (!toSessionId) {
      throw new BadRequestException("Telegram cart session required");
    }
    const fromSessionId = String(body?.fromSessionId ?? "").trim();
    if (!fromSessionId) {
      throw new BadRequestException("fromSessionId required");
    }
    if (isTelegramCartSessionId(fromSessionId)) {
      throw new BadRequestException("Cannot merge another Telegram cart");
    }
    return this.cart.mergeSessionCart(fromSessionId, toSessionId);
  }
}
