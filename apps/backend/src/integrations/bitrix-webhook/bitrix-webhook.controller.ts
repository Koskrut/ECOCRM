import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from "../../auth/public.decorator";
import { BitrixWebhookService } from "./bitrix-webhook.service";

const WEBHOOK_SECRET_HEADER = "x-bitrix-webhook-secret";

/** Bitrix event name -> [entityType, eventType]. */
const EVENT_MAP: Record<string, [string, string]> = {
  ONCRMCONTACTADD: ["contact", "create"],
  ONCRMCONTACTUPDATE: ["contact", "update"],
  ONCRMCONTACTDELETE: ["contact", "delete"],
  ONCRMCOMPANYADD: ["company", "create"],
  ONCRMCOMPANYUPDATE: ["company", "update"],
  ONCRMCOMPANYDELETE: ["company", "delete"],
  ONCRMLEADADD: ["lead", "create"],
  ONCRMLEADUPDATE: ["lead", "update"],
  ONCRMLEADDELETE: ["lead", "delete"],
  ONCRMDEALADD: ["deal", "create"],
  ONCRMDEALUPDATE: ["deal", "update"],
  ONCRMDEALDELETE: ["deal", "delete"],
};

function parseBitrixWebhookPayload(body: unknown): {
  eventType: string;
  entityType: string | null;
  entityLegacyId: number | null;
} {
  if (!body || typeof body !== "object") {
    return { eventType: "unknown", entityType: null, entityLegacyId: null };
  }
  const o = body as Record<string, unknown>;
  const eventName = typeof o["event"] === "string" ? o["event"].toUpperCase() : "";
  const mapped = EVENT_MAP[eventName];
  const [entityType, eventType] = mapped ?? [null, eventName || "unknown"];

  let entityLegacyId: number | null = null;
  const data = o["data"];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const fields = d["FIELDS"];
    if (fields && typeof fields === "object") {
      const f = fields as Record<string, unknown>;
      const id = f["ID"];
      if (typeof id === "number") entityLegacyId = id;
      else if (typeof id === "string") entityLegacyId = parseInt(id, 10) || null;
    }
    if (entityLegacyId == null && typeof d["ID"] === "number") entityLegacyId = d["ID"] as number;
    if (entityLegacyId == null && typeof d["ID"] === "string") entityLegacyId = parseInt(d["ID"] as string, 10) || null;
  }

  return {
    eventType,
    entityType,
    entityLegacyId,
  };
}

@Controller("integrations/bitrix")
export class BitrixWebhookController {
  private readonly logger = new Logger(BitrixWebhookController.name);

  constructor(private readonly webhookService: BitrixWebhookService) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers(WEBHOOK_SECRET_HEADER) secretToken: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    if (process.env.BITRIX_WEBHOOK_ENABLED !== "true") {
      throw new UnauthorizedException("Bitrix webhook is disabled");
    }
    const expected = process.env.BITRIX_WEBHOOK_SECRET ?? "";
    if (expected && secretToken !== expected) {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    const { eventType, entityType, entityLegacyId } = parseBitrixWebhookPayload(body);
    const payloadHash = this.webhookService.computePayloadHash(body);

    const event = await this.webhookService.storeEvent({
      integration: "bitrix",
      eventType,
      entityType: entityType ?? undefined,
      entityLegacyId: entityLegacyId ?? undefined,
      payload: (body ?? {}) as object,
      payloadHash,
      status: "pending",
    });

    setImmediate(() => {
      this.webhookService.processEvent(event.id).catch((err) => {
        this.logger.error(`Background webhook process error: ${event.id}`, err);
      });
    });

    return { ok: true };
  }
}
