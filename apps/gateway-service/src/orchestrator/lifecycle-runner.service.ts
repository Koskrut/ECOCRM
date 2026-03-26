import { Injectable } from "@nestjs/common";
import type { SessionEntity } from "../contracts/gateway.types";
import type { GatewayOutboundEvent } from "../contracts/gateway.types";
import { SessionRegistryService } from "../sessions/session-registry.service";
import { SessionEventsService } from "../sessions/session-events.service";
import { CorrelationIdService } from "../sessions/correlation-id.service";
import { CrmWebhookClientService } from "../crm-webhooks/crm-webhook-client.service";
import { MockTelephonyProvider } from "../providers/mock-telephony.provider";
import { MockAiVoiceProvider } from "../providers/mock-ai-voice.provider";
import { getOutcomeFixtures } from "../mock/fixtures";
import { outcomeKeyForMock } from "../tools/classify-reason.tool";
import { StructuredLogger } from "../common/structured-logger";
import { doNotCallPayload } from "../tools/mark-do-not-call.tool";

const STEP_MS = 15;

@Injectable()
export class LifecycleRunnerService {
  constructor(
    private readonly registry: SessionRegistryService,
    private readonly events: SessionEventsService,
    private readonly ids: CorrelationIdService,
    private readonly crm: CrmWebhookClientService,
    private readonly telephony: MockTelephonyProvider,
    private readonly ai: MockAiVoiceProvider,
    private readonly log: StructuredLogger,
  ) {}

  async runMockLifecycle(session: SessionEntity, fetchImpl?: typeof fetch): Promise<void> {
    const fx = getOutcomeFixtures(session.mockOutcome);
    let s = session;

    const send = async (
      partial: Omit<GatewayOutboundEvent, "deliveryId" | "occurredAt" | "correlationIds"> & {
        deliveryId?: string;
      },
    ) => {
      const deliveryId = partial.deliveryId ?? this.ids.newDeliveryId();
      const occurredAt = new Date().toISOString();
      const ev: GatewayOutboundEvent = {
        ...partial,
        deliveryId,
        occurredAt,
        correlationIds: { ...s.correlationIds },
      };
      const fresh = this.registry.get(s.externalSessionId);
      if (fresh) s = fresh;
      this.events.append(s.externalSessionId, ev.eventType, deliveryId, { ...ev.payload, occurredAt });
      await this.crm.sendToCrm(s, ev, fetchImpl);
    };

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
    const leg = await this.telephony.createOutboundLeg({
      externalSessionId: s.externalSessionId,
      e164Phone: s.phone,
      attemptId: s.attemptId,
    });
    this.registry.patch(s.externalSessionId, {
      correlationIds: {
        ...s.correlationIds,
        providerCallId: leg.providerCallId,
      },
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
    const aiHandle = await this.ai.createSession({
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

    this.log.log("Mock lifecycle completed", {
      externalSessionId: s.externalSessionId,
      attemptId: s.attemptId,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
