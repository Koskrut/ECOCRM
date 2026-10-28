import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { BotSessionState } from "./telegram-client.constants";

export type BotSessionPayload = {
  catalogPage?: number;
  catalogSearch?: string;
  /** SKU prefix of the open catalog system, e.g. "01". */
  catalogGroup?: string;
  /** category_name open in the catalog tree. */
  catalogCategory?: string;
  /** subcategory_name open under catalogCategory. */
  catalogSubcategory?: string;
  /** catalogCategory is itself a subcategory with no parent category. */
  catalogCategoryOnlySub?: boolean;
  /** Categories of the open system, so a button index stays valid. */
  catalogBranches?: Array<{ name: string; subcategoryOnly?: boolean; children: string[] }>;
  /** Subcategories of the open category. */
  catalogSubHits?: string[];
  productId?: string;
  ordersPage?: number;
  /** New-client onboarding (no CRM contact yet). */
  onboardingFirstName?: string;
  onboardingLastName?: string;
  /** CRM Contact.clientType: "Врач" | "Техник". */
  onboardingClientType?: string;
  /** Checkout draft */
  region?: string;
  deliveryMethod?: "PICKUP" | "NOVA_POSHTA";
  paymentMethod?: string;
  paymentType?: string;
  profileId?: string;
  deliveryType?: "WAREHOUSE" | "POSTOMAT" | "ADDRESS";
  cityRef?: string;
  cityName?: string;
  warehouseRef?: string;
  warehouseName?: string;
  streetRef?: string;
  streetName?: string;
  building?: string;
  flat?: string;
  comment?: string;
  /** Cash on delivery (Nova Poshta), not CRM credit terms. */
  cod?: boolean;
  /** Short-lived search result lists for callback indices */
  cityHits?: Array<{ ref: string; name: string }>;
  warehouseHits?: Array<{ ref: string; name: string }>;
  streetHits?: Array<{ ref: string; name: string }>;
  catalogHits?: Array<{ id: string; name: string }>;
};

@Injectable()
export class TelegramBotSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async get(telegramUserId: string): Promise<{
    state: BotSessionState;
    payload: BotSessionPayload;
  }> {
    const row = await this.prisma.telegramBotSession.findUnique({
      where: { telegramUserId },
    });
    return {
      state: (row?.state as BotSessionState) || "idle",
      payload: (row?.payload as BotSessionPayload) ?? {},
    };
  }

  async set(
    telegramUserId: string,
    state: BotSessionState,
    payload: BotSessionPayload = {},
  ): Promise<void> {
    await this.prisma.telegramBotSession.upsert({
      where: { telegramUserId },
      create: {
        telegramUserId,
        state,
        payload: payload as Prisma.InputJsonValue,
      },
      update: {
        state,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  async patchPayload(
    telegramUserId: string,
    state: BotSessionState,
    patch: Partial<BotSessionPayload>,
  ): Promise<BotSessionPayload> {
    const current = await this.get(telegramUserId);
    const next = { ...current.payload, ...patch };
    await this.set(telegramUserId, state, next);
    return next;
  }

  async resetIdle(telegramUserId: string): Promise<void> {
    await this.set(telegramUserId, "idle", {});
  }
}
