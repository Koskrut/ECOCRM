import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { metaGraphApiVersion } from "../meta-audiences/meta-audience.normalize";
import { postMetaEvent, type MetaSendConfig } from "./meta-conversions.client";
import { applyMetaConversionsPatch, parseStoredMetaConversions, toPublicMetaConversions, type MetaConversionsPatch } from "./meta-conversions.config";
import {
  buildAddToCartEvent,
  buildContactEvent,
  buildInitiateCheckoutEvent,
  buildPurchaseEvent,
  buildTestPurchaseEvent,
  buildViewContentEvent,
  isPromoView,
  type MetaEvent,
} from "./meta-conversions.events";
import {
  META_CONVERSIONS_SETTING_ID,
  type AddToCartInput,
  type ContactInput,
  type InitiateCheckoutInput,
  type PublicMetaConversions,
  type PurchaseInput,
  type StoredMetaConversions,
  type ViewContentInput,
} from "./meta-conversions.types";
import { PrismaService } from "../../prisma/prisma.service";

const SENT_ID_LIMIT = 2000;

@Injectable()
export class MetaConversionsService {
  private readonly logger = new Logger(MetaConversionsService.name);
  private readonly pending = new Set<string>();
  private tail: Promise<void> = Promise.resolve();
  fetchImpl: typeof fetch = fetch;

  constructor(private readonly prisma: PrismaService) {}

  async getPublic(): Promise<PublicMetaConversions> {
    return toPublicMetaConversions(await this.read());
  }

  async update(patch: MetaConversionsPatch): Promise<PublicMetaConversions> {
    const next = await this.locked(async () => {
      const stored = applyMetaConversionsPatch(await this.read(), patch);
      await this.write(stored);
      return stored;
    });
    return toPublicMetaConversions(next);
  }

  /** Pixel id for the storefront. Empty until sending is turned on and a token is saved. */
  async publicBrowserConfig(): Promise<{ pixelId: string | null; enabled: boolean }> {
    const stored = await this.read();
    const ready = stored.enabled && Boolean(stored.accessToken);
    return { pixelId: ready ? stored.pixelId : null, enabled: ready };
  }

  async trackPurchase(input: PurchaseInput): Promise<void> {
    const orderId = input.orderId?.trim() ?? "";
    if (!orderId) return;
    const event = buildPurchaseEvent({ ...input, orderId });
    await this.send(orderId, event);
  }

  async trackAddToCart(input: AddToCartInput): Promise<{ sent: boolean }> {
    const event = buildAddToCartEvent(input);
    if (!event) return { sent: false };
    return this.send(event.event_id, event);
  }

  async trackInitiateCheckout(input: InitiateCheckoutInput): Promise<{ sent: boolean }> {
    const event = buildInitiateCheckoutEvent(input);
    if (!event) return { sent: false };
    return this.send(event.event_id, event);
  }

  async trackContact(input: ContactInput): Promise<void> {
    const label = input.label?.trim() ?? "";
    const eventId = input.eventId?.trim() ?? "";
    if (!label || !eventId) return;
    await this.send(eventId, buildContactEvent({ ...input, label, eventId }));
  }

  async trackViewContent(input: ViewContentInput): Promise<{ sent: boolean }> {
    if (!isPromoView(input.path ?? "", input.search ?? "")) return { sent: false };
    const eventId = input.eventId?.trim() ?? "";
    if (!eventId) return { sent: false };
    return this.send(eventId, buildViewContentEvent({ ...input, eventId }));
  }

  async sendTestPurchase(): Promise<{ ok: boolean; error: string | null; config: PublicMetaConversions }> {
    const stored = await this.read();
    if (!stored.testEventCode.trim()) {
      throw new BadRequestException("Вкажіть test event code");
    }
    if (!stored.enabled || !stored.accessToken) {
      throw new BadRequestException("Увімкніть надсилання і збережіть токен Conversions API");
    }
    const eventId = `test-${Date.now()}`;
    const result = await this.send(eventId, buildTestPurchaseEvent(eventId));
    return { ok: result.sent, error: result.error, config: await this.getPublic() };
  }

  private async send(
    eventId: string,
    event: MetaEvent,
  ): Promise<{ sent: boolean; error: string | null }> {
    const claimed = await this.claim(eventId);
    if (!claimed) return { sent: false, error: null };
    const result = await postMetaEvent(this.fetchImpl, claimed, event);
    await this.finish(eventId, event.event_name, result);
    return { sent: result.ok, error: result.ok ? null : result.error };
  }

  private async claim(eventId: string): Promise<MetaSendConfig | null> {
    return this.locked(async () => {
      const stored = await this.read();
      if (!stored.enabled || !stored.accessToken) return null;
      if (this.pending.has(eventId) || stored.sentEventIds.includes(eventId)) return null;
      this.pending.add(eventId);
      return {
        pixelId: stored.pixelId,
        accessToken: stored.accessToken,
        testEventCode: stored.testEventCode,
        version: metaGraphApiVersion(),
      };
    });
  }

  private async finish(
    eventId: string,
    eventName: string,
    result: { ok: true } | { ok: false; error: string },
  ): Promise<void> {
    await this.locked(async () => {
      const stored = await this.read();
      if (result.ok) {
        const ids = stored.sentEventIds.filter((id) => id !== eventId);
        ids.push(eventId);
        stored.sentEventIds = ids.slice(-SENT_ID_LIMIT);
        stored.lastSuccessAt = new Date().toISOString();
        stored.lastEventName = eventName;
        stored.lastError = null;
      } else {
        this.pending.delete(eventId);
        stored.lastError = result.error;
        this.logger.warn(`Meta conversions ${eventName}: ${result.error}`);
      }
      await this.write(stored);
    });
  }

  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async read(): Promise<StoredMetaConversions> {
    const row = await this.prisma.systemSetting.findUnique({ where: { id: META_CONVERSIONS_SETTING_ID } });
    return parseStoredMetaConversions(row?.value);
  }

  private async write(stored: StoredMetaConversions): Promise<void> {
    const value = stored as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { id: META_CONVERSIONS_SETTING_ID },
      create: { id: META_CONVERSIONS_SETTING_ID, value },
      update: { value },
    });
  }
}
