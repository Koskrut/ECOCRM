import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductStore } from "../../products/product.store";
import { SettingsService } from "../../settings/settings.service";
import { publicStoreCharacteristics } from "../catalog/store-product-characteristics";

const cartInclude = {
  items: { include: { product: true }, orderBy: { createdAt: "asc" as const } },
};

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

type CartIdentity = { customerId?: string; sessionId?: string };

@Injectable()
export class StoreCartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productStore: ProductStore,
    private readonly settings: SettingsService,
  ) {}

  private async assertStockAvailable(productId: string, requestedQty: number) {
    const product = await this.productStore.findById(productId);
    if (!product || !product.isActive || !product.showOnStore) {
      throw new NotFoundException("Product not found or inactive");
    }
    if (requestedQty > product.stock) {
      throw new BadRequestException(
        `Недостатньо товару на складі. Доступно: ${product.stock}, запитано: ${requestedQty}`,
      );
    }
    return product;
  }

  private async getOrCreateCart(identity: CartIdentity) {
    if (identity.customerId) {
      const existing = await this.prisma.cart.findFirst({
        where: { customerId: identity.customerId },
        include: cartInclude,
      });
      if (existing) return existing;
      try {
        return await this.prisma.cart.create({
          data: { customerId: identity.customerId },
          include: cartInclude,
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        const cart = await this.prisma.cart.findFirst({
          where: { customerId: identity.customerId },
          include: cartInclude,
        });
        if (!cart) throw e;
        return cart;
      }
    }
    if (identity.sessionId) {
      return this.prisma.cart.upsert({
        where: { sessionId: identity.sessionId },
        create: { sessionId: identity.sessionId },
        update: {},
        include: cartInclude,
      });
    }
    throw new BadRequestException("Either customerId or sessionId required");
  }

  async getCart(identity: CartIdentity) {
    const [cart, rates] = await Promise.all([
      this.getOrCreateCart(identity),
      this.settings.getExchangeRates(),
    ]);
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
    const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      id: cart.id,
      uahPerUsd,
      items: cart.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        sku: i.product.sku,
        name: i.product.name,
        unit: i.product.unit,
        primaryImageId: i.product.primaryImageId ?? null,
        characteristics: publicStoreCharacteristics(
          (i.product.characteristics as Record<string, unknown> | null) ?? null,
        ),
        qty: i.qty,
        price: i.price,
        lineTotal: i.price * i.qty,
      })),
      subtotal,
    };
  }

  async addItem(identity: CartIdentity, productId: string, qty: number) {
    const addQty = Math.max(1, Math.floor(qty));
    const cart = await this.getOrCreateCart(identity);
    const existing = cart.items.find((i) => i.productId === productId);
    const targetQty = (existing?.qty ?? 0) + addQty;
    const product = await this.assertStockAvailable(productId, targetQty);
    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { qty: targetQty },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          qty: addQty,
          price: product.basePrice,
        },
      });
    }
    return this.getCart(identity);
  }

  async updateItemQty(identity: CartIdentity, itemId: string, qty: number) {
    const cart = await this.getOrCreateCart(identity);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Cart item not found");
    const newQty = Math.max(0, Math.floor(qty));
    if (newQty === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.assertStockAvailable(item.productId, newQty);
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { qty: newQty },
      });
    }
    return this.getCart(identity);
  }

  async removeItem(identity: CartIdentity, itemId: string) {
    const cart = await this.getOrCreateCart(identity);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Cart item not found");
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(identity);
  }

  async clearCart(identity: CartIdentity) {
    const cart = await this.getOrCreateCart(identity);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(identity);
  }

  /**
   * Bot and Mini App both read `tg:{userId}`. If a customer cart still holds lines
   * (older login merged them away), fold those lines back into the telegram session.
   */
  async unifyTelegramCart(customerId: string, sessionId: string) {
    const customerCart = await this.prisma.cart.findFirst({
      where: { customerId },
      include: { items: true },
    });
    if (!customerCart || customerCart.items.length === 0) {
      return this.getCart({ sessionId });
    }
    const sessionCart = await this.prisma.cart.upsert({
      where: { sessionId },
      create: { sessionId },
      update: {},
      include: { items: true },
    });
    const qtyByProduct = new Map(
      sessionCart.items.map((item) => [item.productId, { id: item.id, qty: item.qty }]),
    );
    for (const line of customerCart.items) {
      const existing = qtyByProduct.get(line.productId);
      if (existing) {
        const qty = existing.qty + line.qty;
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { qty },
        });
        existing.qty = qty;
      } else {
        const created = await this.prisma.cartItem.create({
          data: {
            cartId: sessionCart.id,
            productId: line.productId,
            qty: line.qty,
            price: line.price,
          },
        });
        qtyByProduct.set(line.productId, { id: created.id, qty: line.qty });
      }
    }
    await this.prisma.cartItem.deleteMany({ where: { cartId: customerCart.id } });
    return this.getCart({ sessionId });
  }

  /**
   * Fold a browser guest cart into the Telegram `tg:{userId}` cart.
   * Mini App often adds lines on a localStorage UUID before initData/login finishes.
   */
  async mergeSessionCart(fromSessionId: string, toSessionId: string) {
    const from = (fromSessionId ?? "").trim();
    const to = (toSessionId ?? "").trim();
    if (!from || !to) {
      throw new BadRequestException("fromSessionId and toSessionId required");
    }
    if (from === to) return this.getCart({ sessionId: to });

    const guestCart = await this.prisma.cart.findFirst({
      where: { sessionId: from },
      include: { items: true },
    });
    if (!guestCart || guestCart.items.length === 0) {
      return this.getCart({ sessionId: to });
    }

    const targetCart = await this.prisma.cart.upsert({
      where: { sessionId: to },
      create: { sessionId: to },
      update: {},
      include: { items: true },
    });
    const qtyByProduct = new Map(
      targetCart.items.map((item) => [item.productId, { id: item.id, qty: item.qty }]),
    );
    for (const line of guestCart.items) {
      const existing = qtyByProduct.get(line.productId);
      if (existing) {
        const qty = existing.qty + line.qty;
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { qty },
        });
        existing.qty = qty;
      } else {
        const created = await this.prisma.cartItem.create({
          data: {
            cartId: targetCart.id,
            productId: line.productId,
            qty: line.qty,
            price: line.price,
          },
        });
        qtyByProduct.set(line.productId, { id: created.id, qty: line.qty });
      }
    }
    await this.prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } });
    await this.prisma.cart.delete({ where: { id: guestCart.id } }).catch(() => undefined);
    return this.getCart({ sessionId: to });
  }

  /** Merge guest cart (sessionId) into customer cart and return customer cart. */
  async mergeCart(customerId: string, sessionId: string) {
    const guestCart = await this.prisma.cart.findFirst({
      where: { sessionId },
      include: { items: true },
    });
    if (!guestCart || guestCart.items.length === 0) {
      return this.getCart({ customerId });
    }
    let customerCart = await this.prisma.cart.findFirst({
      where: { customerId },
      include: { items: { include: { product: true } } },
    });
    if (!customerCart) {
      customerCart = await this.prisma.cart.create({
        data: { customerId },
        include: { items: { include: { product: true } } },
      });
    }
    for (const gi of guestCart.items) {
      const existing = customerCart.items.find((i) => i.productId === gi.productId);
      if (existing) {
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { qty: existing.qty + gi.qty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: customerCart.id,
            productId: gi.productId,
            qty: gi.qty,
            price: gi.price,
          },
        });
      }
    }
    await this.prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } });
    await this.prisma.cart.delete({ where: { id: guestCart.id } }).catch(() => {});
    return this.getCart({ customerId });
  }
}
