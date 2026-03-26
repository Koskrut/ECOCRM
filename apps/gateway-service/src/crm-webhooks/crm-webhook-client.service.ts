import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import type { SessionEntity } from "../contracts/gateway.types";
import type { GatewayOutboundEvent } from "../contracts/gateway.types";
import { toCrmWebhookBody } from "./crm-webhook-mapper";
import { CrmWebhookSignatureService } from "./crm-webhook-signature.service";
import { DeliveryLogService } from "./delivery-log.service";
import { StructuredLogger } from "../common/structured-logger";

export type SendResult = { ok: true; httpStatus: number } | { ok: false; error: string; httpStatus?: number };

@Injectable()
export class CrmWebhookClientService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly signatures: CrmWebhookSignatureService,
    private readonly deliveryLog: DeliveryLogService,
    private readonly log: StructuredLogger,
  ) {}

  async sendToCrm(session: SessionEntity, ev: GatewayOutboundEvent, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
    if (!session.webhookUrl) {
      this.log.warn("No webhookUrl on session; skipping CRM delivery", {
        externalSessionId: session.externalSessionId,
        attemptId: session.attemptId,
      });
      return { ok: false, error: "no_webhook_url" };
    }

    const body = toCrmWebhookBody(ev);
    const hdr = this.signatures.resolveHeader(session.webhookSecretHeader);
    const timeoutMs = this.config.crmWebhookTimeoutMs;
    const maxRetries = this.config.crmWebhookRetryCount;
    const baseDelay = this.config.crmWebhookRetryDelayMs;
    const maxBackoff = this.config.crmWebhookMaxBackoffMs;

    const initial = this.deliveryLog.createPending({
      deliveryId: ev.deliveryId,
      attemptId: ev.attemptId,
      externalSessionId: session.externalSessionId,
      eventType: ev.eventType,
      createdAt: new Date().toISOString(),
    });

    let tryCount = 0;
    let lastErr = "";
    let lastHttp: number | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      tryCount = attempt + 1;
      this.deliveryLog.recordAttempt(ev.deliveryId, {
        tryCount,
        lastStatus: "pending",
        lastError: null,
      });

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(session.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [hdr.name]: hdr.value,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        lastHttp = res.status;
        if (res.ok) {
          const now = new Date().toISOString();
          this.deliveryLog.recordAttempt(ev.deliveryId, {
            tryCount,
            lastStatus: "success",
            lastHttpStatus: res.status,
            sentAt: now,
            deliveredAt: now,
            lastError: null,
          });
          this.log.log("CRM webhook delivered", {
            externalSessionId: session.externalSessionId,
            attemptId: session.attemptId,
            eventType: ev.eventType,
            deliveryId: ev.deliveryId,
            tryCount: String(tryCount),
          });
          return { ok: true, httpStatus: res.status };
        }
        const text = await res.text().catch(() => "");
        lastErr = `${res.status} ${text.slice(0, 200)}`;
        this.deliveryLog.recordAttempt(ev.deliveryId, {
          tryCount,
          lastStatus: "failed",
          lastHttpStatus: res.status,
          lastError: lastErr,
        });
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        this.deliveryLog.recordAttempt(ev.deliveryId, {
          tryCount,
          lastStatus: "failed",
          lastError: lastErr,
          lastHttpStatus: lastHttp,
        });
      } finally {
        clearTimeout(t);
      }

      if (attempt < maxRetries) {
        const backoff = Math.min(maxBackoff, baseDelay * 2 ** attempt);
        await delay(backoff);
      }
    }

    this.log.error("CRM webhook exhausted retries", {
      externalSessionId: session.externalSessionId,
      attemptId: session.attemptId,
      eventType: ev.eventType,
      deliveryId: ev.deliveryId,
      tryCount: String(tryCount),
    });
    void initial;
    return { ok: false, error: lastErr, httpStatus: lastHttp };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
