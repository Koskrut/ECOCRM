import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { SettingsService } from "../../settings/settings.service";
import { StoreCartService } from "./store-cart.service";

type RequestWithCustomer = Request & {
  customer?: { customerId: string; contactId: string };
};

@Controller("store/cart")
export class StoreCartController {
  constructor(
    private readonly cart: StoreCartService,
    private readonly settings: SettingsService,
  ) {}

  private getIdentity(req: RequestWithCustomer): { customerId?: string; sessionId?: string } {
    if (req.customer) return { customerId: req.customer.customerId };
    const sessionId =
      (req.headers["x-store-cart-session"] as string) ||
      (req.body?.sessionId as string) ||
      (req.query?.sessionId as string);
    return sessionId ? { sessionId } : {};
  }

  @Get()
  async get(@Req() req: RequestWithCustomer) {
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
    @Req() req: RequestWithCustomer,
    @Body() body: { productId: string; qty?: number; sessionId?: string },
  ) {
    const identity = this.getIdentity(req);
    if (body.sessionId && !identity.customerId) (identity as { sessionId?: string }).sessionId = body.sessionId;
    return this.cart.addItem(
      identity,
      String(body.productId ?? ""),
      typeof body.qty === "number" ? body.qty : 1,
    );
  }

  @Patch("items/:itemId")
  async updateItem(
    @Req() req: RequestWithCustomer,
    @Param("itemId") itemId: string,
    @Body() body: { qty: number },
  ) {
    const identity = this.getIdentity(req);
    return this.cart.updateItemQty(identity, itemId, Number(body.qty) ?? 0);
  }

  @Delete("items/:itemId")
  async removeItem(@Req() req: RequestWithCustomer, @Param("itemId") itemId: string) {
    const identity = this.getIdentity(req);
    return this.cart.removeItem(identity, itemId);
  }

  @Delete()
  async clear(@Req() req: RequestWithCustomer) {
    const identity = this.getIdentity(req);
    return this.cart.clearCart(identity);
  }
}
