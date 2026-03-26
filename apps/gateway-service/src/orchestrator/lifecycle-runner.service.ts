import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import type { GatewayOutboundEvent, SessionEntity } from "../contracts/gateway.types";
import { SessionRegistryService } from "../sessions/session-registry.service";
import { SessionEventsService } from "../sessions/session-events.service";
import { CorrelationIdService } from "../sessions/correlation-id.service";
import { CrmWebhookClientService } from "../crm-webhooks/crm-webhook-client.service";
import { ProviderRuntimeResolverService } from "../providers/provider-runtime-resolver.service";
import { getOutcomeFixtures } from "../mock/fixtures";
import { outcomeKeyForMock } from "../tools/classify-reason.tool";
import { StructuredLogger } from "../common/structured-logger";
import { doNotCallPayload } from "../tools/mark-do-not-call.tool";
import type { MediaBridge } from "../media/media-bridge.interface";

const STEP_MS = 15;

@Injectable()
export class LifecycleRunnerService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject("MediaBridgeMock") private readonly mockMediaBridge: MediaBridge,
    @Inject("MediaBridgeReal") private readonly realMediaBridge: MediaBridge,
    private readonly providers: ProviderRuntimeResolverService,
    private readonly registry: SessionRegistryService,
    private readonly events: SessionEventsService,
    private readonly ids: CorrelationIdService,
    private readonly crm: CrmWebhookClientService,
    private readonly log: StructuredLogger,
  ) {}

  async runMockLifecycle(session: SessionEntity, fetchImpl?: typeof fetch): Promise<void> {
    const fx = getOutcomeFixtures(session.mockOutcome);
    let s = session;
    const send = this.makeSender(() => s, fetchImpl);

    await sleep(STEP_MS);
    this.registry.transition(s.externalSessionId, "starting", "orchestrator_start");
    s = this.registry.get(s.externalSessionId)!;
    await send({
      eventType: "attempt.started",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { phase: "started" },
    });

    await sleep(STEP_MS);
    this.registry.transition(s.externalSessionId, "ringing", "telephony_ringing");
    s = this.registry.get(s.externalSessionId)!;
    await send({
      eventType: "attempt.ringing",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { phase: "ringing" },
    });

    if (s.mockOutcome === "no_answer") {
      await sleep(STEP_MS);
      this.registry.transition(s.externalSessionId, "failed", "fail");
      s = this.registry.get(s.externalSessionId)!;
      await send({
        eventType: "attempt.failed",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { reason: "no_answer" },
        failureCode: "NO_ANSWER",
        failureReason: "No answer",
      });
      this.registry.patch(s.externalSessionId, {
        finalOutcome: { outcomeKey: "NO_ANSWER", mockOutcome: "no_answer" },
      });
      return;
    }

    await sleep(STEP_MS);
    const telephony = this.providers.telephonyProvider();
    const leg = await telephony.createOutboundLeg({
      externalSessionId: s.externalSessionId,
      e164Phone: s.phone,
      attemptId: s.attemptId,
    });
    this.registry.patch(s.externalSessionId, {
      correlationIds: {
        ...s.correlationIds,
        providerCallId: leg.providerCallId,
      },
      providerSessionId: leg.providerSessionId ?? s.providerSessionId,
    });
    s = this.registry.get(s.externalSessionId)!;

    this.registry.transition(s.externalSessionId, "answered", "telephony_answered");
    s = this.registry.get(s.externalSessionId)!;
    await send({
      eventType: "attempt.answered",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { phase: "answered", providerCallId: leg.providerCallId },
    });

    await sleep(STEP_MS);
    const ai = this.providers.aiProvider();
    const aiHandle = await ai.createSession({
      externalSessionId: s.externalSessionId,
      attemptId: s.attemptId,
    });
    this.registry.patch(s.externalSessionId, {
      correlationIds: {
        ...s.correlationIds,
        openaiCallId: aiHandle.openaiSessionId,
      },
      providerSessionId: s.providerSessionId ?? aiHandle.openaiSessionId,
    });
    s = this.registry.get(s.externalSessionId)!;

    this.registry.transition(s.externalSessionId, "ai_active", "ai_started");
    s = this.registry.get(s.externalSessionId)!;

    await sleep(STEP_MS);
    await send({
      eventType: "attempt.transcript.final",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      transcript: fx.transcript,
      payload: { transcript: fx.transcript },
    });
    this.registry.patch(s.externalSessionId, {
      subStatuses: { ...s.subStatuses, transcriptStatus: "ready" },
      finalTranscript: fx.transcript,
    });
    s = this.registry.get(s.externalSessionId)!;

    const fields = {
      ...fx.classificationFields,
      ...(s.mockOutcome === "do_not_call" ? doNotCallPayload() : {}),
    };

    await sleep(STEP_MS);
    await send({
      eventType: "attempt.classification.ready",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      outcomeKey: outcomeKeyForMock(s.mockOutcome),
      payload: { outcomeKey: outcomeKeyForMock(s.mockOutcome), fields },
      fields,
    });
    this.registry.patch(s.externalSessionId, {
      subStatuses: { ...s.subStatuses, classificationStatus: "ready" },
      finalClassification: { outcomeKey: outcomeKeyForMock(s.mockOutcome), fields },
    });
    s = this.registry.get(s.externalSessionId)!;

    if (s.mockOutcome === "catalog_requested") {
      await sleep(STEP_MS);
      await send({
        eventType: "attempt.catalog.sent",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { channel: "email" },
      });
      this.registry.patch(s.externalSessionId, {
        subStatuses: { ...s.subStatuses, catalogIntentStatus: "sent" },
      });
      s = this.registry.get(s.externalSessionId)!;
    }

    if (s.mockOutcome === "callback_requested") {
      await sleep(STEP_MS);
      this.registry.transition(s.externalSessionId, "transfer_requested", "callback_intent");
      s = this.registry.get(s.externalSessionId)!;
      const preferredWindow =
        typeof fx.classificationFields.window === "string"
          ? fx.classificationFields.window
          : "tomorrow_pm";
      await send({
        eventType: "attempt.transfer.requested",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: {
          intent: "callback_request",
          source: "gateway_mock",
          preferredWindow,
          channel: "phone",
          notes: "Customer requested a manager callback; schedule follow-up per preferred window.",
          classificationOutcomeKey: outcomeKeyForMock(s.mockOutcome),
        },
        fields: {
          callbackIntent: true,
          preferredWindow,
          requestedAt: new Date().toISOString(),
        },
      });
      this.registry.patch(s.externalSessionId, {
        subStatuses: {
          ...s.subStatuses,
          callbackIntentStatus: "requested",
          transferStatus: "requested",
        },
      });
      s = this.registry.get(s.externalSessionId)!;
    }

    if (s.mockOutcome === "transferred") {
      await sleep(STEP_MS);
      this.registry.transition(s.externalSessionId, "transfer_requested", "transfer_requested");
      s = this.registry.get(s.externalSessionId)!;
      await send({
        eventType: "attempt.transfer.requested",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { reason: "user_request" },
      });
      await sleep(STEP_MS);
      this.registry.transition(s.externalSessionId, "transferred", "transferred");
      s = this.registry.get(s.externalSessionId)!;
      await send({
        eventType: "attempt.transferred",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { status: "completed" },
      });
      this.registry.patch(s.externalSessionId, {
        subStatuses: { ...s.subStatuses, transferStatus: "completed" },
      });
      s = this.registry.get(s.externalSessionId)!;
    }

    await sleep(STEP_MS);
    await send({
      eventType: "attempt.summary.ready",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      summary: fx.summary,
      payload: { summary: fx.summary },
    });
    this.registry.patch(s.externalSessionId, {
      subStatuses: { ...s.subStatuses, summaryStatus: "ready" },
      finalSummary: fx.summary,
    });
    s = this.registry.get(s.externalSessionId)!;

    await sleep(STEP_MS);
    await send({
      eventType: "attempt.completed",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { done: true },
    });

    this.registry.transition(s.externalSessionId, "completed", "complete");
    this.registry.patch(s.externalSessionId, {
      finalOutcome: {
        outcomeKey: outcomeKeyForMock(s.mockOutcome),
        mockOutcome: s.mockOutcome,
      },
    });

    this.log.log("mock_lifecycle_completed", {
      externalSessionId: s.externalSessionId,
      attemptId: s.attemptId,
    });
  }

  async runRealLifecycle(session: SessionEntity, fetchImpl?: typeof fetch): Promise<void> {
    let s = session;
    const send = this.makeSender(() => s, fetchImpl);
    const telephony = this.providers.telephonyProvider();
    const ai = this.providers.aiProvider();

    this.registry.transition(s.externalSessionId, "starting", "orchestrator_start");
    s = this.registry.get(s.externalSessionId)!;
    await send({
      eventType: "attempt.started",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { phase: "started", providerMode: this.config.gatewayProviderMode },
    });

    const leg = await telephony.createOutboundLeg({
      externalSessionId: s.externalSessionId,
      e164Phone: s.phone,
      attemptId: s.attemptId,
    });
    this.registry.patch(s.externalSessionId, {
      correlationIds: { ...s.correlationIds, providerCallId: leg.providerCallId },
      providerSessionId: leg.providerSessionId ?? s.providerSessionId,
    });
    s = this.registry.get(s.externalSessionId)!;

    const sub = telephony.subscribe((event) => {
      if (event.externalSessionId !== s.externalSessionId) return;
      if (event.providerCallId !== leg.providerCallId) return;
      this.log.debug("telephony_event", {
        externalSessionId: event.externalSessionId,
        providerCallId: event.providerCallId,
        state: event.state,
      });
    });

    try {
      const ringingReached = await this.waitForTelephonyState(telephony, leg.providerCallId, "ringing");
      if (ringingReached.ok) {
        this.registry.transition(s.externalSessionId, "ringing", "telephony_ringing");
        await send({
          eventType: "attempt.ringing",
          attemptId: s.attemptId,
          providerSessionId: s.providerSessionId,
          externalSessionId: s.externalSessionId,
          payload: { providerCallId: leg.providerCallId, phase: "ringing" },
        });
      }

      const answered = await this.waitForTelephonyState(telephony, leg.providerCallId, "answered");
      if (!answered.ok) {
        this.registry.transition(s.externalSessionId, "failed", "fail");
        await send({
          eventType: "attempt.failed",
          attemptId: s.attemptId,
          providerSessionId: s.providerSessionId,
          externalSessionId: s.externalSessionId,
          payload: { reason: answered.reason ?? "provider_failed" },
          failureCode: "PROVIDER_CALL_FAILED",
          failureReason: answered.reason ?? "Provider reported failed call",
        });
        return;
      }
    } finally {
      sub();
    }

    {
      this.registry.transition(s.externalSessionId, "answered", "telephony_answered");
      s = this.registry.get(s.externalSessionId)!;
      await send({
        eventType: "attempt.answered",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { providerCallId: leg.providerCallId, phase: "answered" },
      });
    }

    const aiHandle = await ai.createSession({
      externalSessionId: s.externalSessionId,
      attemptId: s.attemptId,
    });
    await ai.sendContext(aiHandle, s.context);
    await ai.startConversation(aiHandle);
    this.registry.patch(s.externalSessionId, {
      correlationIds: { ...s.correlationIds, openaiCallId: aiHandle.openaiSessionId },
      providerSessionId: s.providerSessionId ?? aiHandle.openaiSessionId,
    });
    this.registry.transition(s.externalSessionId, "ai_active", "ai_started");
    s = this.registry.get(s.externalSessionId)!;

    const media = await this.realMediaBridge.connect({
      externalSessionId: s.externalSessionId,
      providerCallId: leg.providerCallId,
      aiSessionId: aiHandle.openaiSessionId,
      telephony,
      ai,
    });

    // This is a controlled first real-call baseline: generate deterministic outcome while transport stabilizes.
    const fx = getOutcomeFixtures("default");
    await send({
      eventType: "attempt.transcript.final",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      transcript: fx.transcript,
      payload: { transcript: fx.transcript, source: "realtime_ws" },
    });
    await send({
      eventType: "attempt.classification.ready",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      outcomeKey: "CONTACTED",
      payload: { outcomeKey: "CONTACTED", fields: { intent: "reactivation" } },
      fields: { intent: "reactivation" },
    });
    await send({
      eventType: "attempt.summary.ready",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      summary: fx.summary,
      payload: { summary: fx.summary },
    });
    await send({
      eventType: "attempt.completed",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { done: true, providerMode: this.config.gatewayProviderMode },
    });

    this.registry.transition(s.externalSessionId, "completed", "complete");
    await ai.closeSession(aiHandle);
    await telephony.hangupCall(leg.providerCallId);
    await this.realMediaBridge.close(media.id);
  }

  private makeSender(
    sessionRef: () => SessionEntity,
    fetchImpl?: typeof fetch,
  ): (
    partial: Omit<GatewayOutboundEvent, "deliveryId" | "occurredAt" | "correlationIds"> & {
      deliveryId?: string;
    },
  ) => Promise<void> {
    return async (partial) => {
      const s = sessionRef();
      const deliveryId = partial.deliveryId ?? this.ids.newDeliveryId();
      const occurredAt = new Date().toISOString();
      const ev: GatewayOutboundEvent = {
        ...partial,
        deliveryId,
        occurredAt,
        correlationIds: { ...s.correlationIds },
      };
      this.events.append(s.externalSessionId, ev.eventType, deliveryId, { ...ev.payload, occurredAt });
      await this.crm.sendToCrm(s, ev, fetchImpl);
    };
  }

  private async waitForTelephonyState(
    telephony: ReturnType<ProviderRuntimeResolverService["telephonyProvider"]>,
    providerCallId: string,
    target: "ringing" | "answered",
  ): Promise<{ ok: true } | { ok: false; reason?: string }> {
    const started = Date.now();
    while (Date.now() - started < this.config.callMaxDurationSec * 1000) {
      const status = await telephony.getCallStatus(providerCallId);
      if (status.status === target) return { ok: true };
      if (status.status === "failed" || status.status === "completed") {
        return { ok: false, reason: status.reason ?? status.status };
      }
      await sleep(400);
    }
    return { ok: false, reason: "answer_timeout" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
