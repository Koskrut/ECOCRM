import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { BitrixDeltaSyncService } from "../bitrix-sync/bitrix.delta-sync.service";

const INTEGRATION = "bitrix";
const ENTITY_CONTACT = "contact";
const ENTITY_COMPANY = "company";
const ENTITY_LEAD = "lead";
const ENTITY_DEAL = "deal";
const EVENT_CREATE = "create";
const EVENT_UPDATE = "update";
const EVENT_DELETE = "delete";
const STATUS_PENDING = "pending";
const STATUS_PROCESSED = "processed";
const STATUS_FAILED = "failed";
const STATUS_SKIPPED = "skipped";

@Injectable()
export class BitrixWebhookService {
  private readonly logger = new Logger(BitrixWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deltaSync: BitrixDeltaSyncService,
  ) {}

  /** Store incoming webhook payload and return the created event (for async processing). */
  async storeEvent(data: {
    integration: string;
    eventType: string;
    entityType?: string;
    entityLegacyId?: number;
    payload: object;
    payloadHash: string;
    status: string;
  }): Promise<{ id: string }> {
    const event = await this.prisma.integrationWebhookEvent.create({
      data: {
        integration: data.integration,
        eventType: data.eventType,
        entityType: data.entityType ?? null,
        entityLegacyId: data.entityLegacyId ?? null,
        payload: data.payload,
        payloadHash: data.payloadHash,
        status: data.status,
      },
    });
    return { id: event.id };
  }

  /** Compute hash of payload for duplicate detection. */
  computePayloadHash(payload: unknown): string {
    const str = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    return createHash("sha256").update(str).digest("hex");
  }

  /** Process a single webhook event by id. Idempotent; safe to call multiple times. */
  async processEvent(eventId: string): Promise<void> {
    const event = await this.prisma.integrationWebhookEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      this.logger.warn(`Webhook event not found: ${eventId}`);
      return;
    }
    if (event.integration !== INTEGRATION) {
      await this.markProcessed(eventId, STATUS_SKIPPED, "Wrong integration");
      return;
    }
    if (event.status === STATUS_PROCESSED) {
      return;
    }
    const entityType = event.entityType ?? "";
    const entityLegacyId = event.entityLegacyId ?? 0;
    const eventType = event.eventType ?? "";

    try {
      if (eventType === EVENT_DELETE) {
        this.logger.log(`Bitrix webhook delete ${entityType} ${entityLegacyId}: logging only (no hard delete)`);
        await this.markProcessed(eventId, STATUS_PROCESSED, null);
        return;
      }

      if (entityType !== ENTITY_CONTACT && entityType !== ENTITY_COMPANY && entityType !== ENTITY_LEAD && entityType !== ENTITY_DEAL) {
        await this.markProcessed(eventId, STATUS_SKIPPED, `Unsupported entity: ${entityType}`);
        return;
      }
      if (!entityLegacyId) {
        await this.markProcessed(eventId, STATUS_SKIPPED, "Missing entity ID");
        return;
      }

      let ok = false;
      switch (entityType) {
        case ENTITY_CONTACT:
          ok = await this.deltaSync.syncContactByBitrixId(entityLegacyId);
          break;
        case ENTITY_COMPANY:
          ok = await this.deltaSync.syncCompanyByBitrixId(entityLegacyId);
          break;
        case ENTITY_LEAD:
          ok = await this.deltaSync.syncLeadByBitrixId(entityLegacyId);
          break;
        case ENTITY_DEAL:
          ok = await this.deltaSync.syncDealByBitrixId(entityLegacyId);
          break;
        default:
          await this.markProcessed(eventId, STATUS_SKIPPED, `Unsupported entity: ${entityType}`);
          return;
      }

      if (ok) {
        await this.markProcessed(eventId, STATUS_PROCESSED, null);
        this.logger.log(`Bitrix webhook processed ${entityType} ${entityLegacyId}`);
      } else {
        await this.markProcessed(eventId, STATUS_FAILED, "Fetch or sync returned false");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Bitrix webhook process failed: ${eventId}`, err);
      await this.markProcessed(eventId, STATUS_FAILED, message);
    }
  }

  private async markProcessed(
    eventId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.integrationWebhookEvent.update({
      where: { id: eventId },
      data: { status, error: error ?? undefined, processedAt: new Date() },
    });
  }

  /** Process pending and failed events (for cron retry). */
  async processPendingEvents(limit = 100): Promise<number> {
    const events = await this.prisma.integrationWebhookEvent.findMany({
      where: {
        integration: INTEGRATION,
        OR: [
          { status: STATUS_PENDING },
          { status: null },
          { status: STATUS_FAILED },
        ],
      },
      orderBy: { receivedAt: "asc" },
      take: limit,
    });
    for (const e of events) {
      await this.processEvent(e.id);
    }
    return events.length;
  }

  @Cron("*/5 * * * *")
  async retryFailedEvents(): Promise<void> {
    if (process.env.BITRIX_WEBHOOK_ENABLED !== "true") return;
    try {
      const processed = await this.processPendingEvents(50);
      if (processed > 0) this.logger.log(`Bitrix webhook retry: processed ${processed} events`);
    } catch (e) {
      this.logger.error("Bitrix webhook retry failed", e);
    }
  }
}
