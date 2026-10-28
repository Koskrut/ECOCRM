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
import { SettingsService } from "../../settings/settings.service";
import {
  isTelegramCartSessionId,
  readStoreTelegramWebAppJwt,
  type RequestWithStoreTg,
} from "../telegram/store-telegram-webapp.util";
import { StoreCartService } from "./store-cart.service";

@Controller("store/cart")
export class StoreCartController {
  constructor(
    private readonly cart: StoreCartService,
    private readonly settings: SettingsService,
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
      return { id: null, uahPerUsd, items: [], subtotal: 0 };
    }
    return this.cart.getCart(identity);
  }

  @Post("items")
  async addItem(
    @Req() req: RequestWithStoreTg,
    @Body() body: { productId: string; qty?: number; sessionId?: string },
  ) {
    const identity = this.getIdentity(req);
    if (body.sessionId && !identity.customerId && !identity.sessionId) {
      if (isTelegramCartSessionId(body.sessionId)) {
        throw new BadRequestException("Telegram cart requires a signed Mini App session");
      }
      (identity as { sessionId?: string }).sessionId = body.sessionId;
    }
    return this.cart.addItem(
      identity,
      String(body.productId ?? ""),
      typeof body.qty === "number" ? body.qty : 1,
    );
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
}
