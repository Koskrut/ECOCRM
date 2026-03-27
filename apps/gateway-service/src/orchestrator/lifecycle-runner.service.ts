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

type RealRuntimeArtifacts = {
  transcriptDeltas: string[];
  transcriptFinal: string | null;
  summary: string | null;
  classification: { outcomeKey: string; fields: Record<string, unknown> } | null;
  completionReason: string | null;
  startedAt: string;
  completedAt: string | null;
};

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

  /**
   * Real lifecycle was eligible but canary whitelist blocked — fail fast with CRM visibility.
   * Does not dial telephony or mock success.
   */
  async runCanaryBlocked(session: SessionEntity, fetchImpl?: typeof fetch, reason = "canary_blocked"): Promise<void> {
    let s = session;
    const send = this.makeSender(() => s, fetchImpl);
    this.registry.transition(s.externalSessionId, "starting", "orchestrator_start");
    s = this.registry.get(s.externalSessionId)!;
    this.registry.transition(s.externalSessionId, "failed", "fail");
    s = this.registry.get(s.externalSessionId)!;
    await send({
      eventType: "attempt.failed",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: { reason, phase: "canary_guard", pilot: true },
      failureCode: "CANARY_BLOCKED",
      failureReason: reason,
    });
    this.log.error("canary_blocked_no_dial", {
      externalSessionId: s.externalSessionId,
      attemptId: s.attemptId,
      reason,
    });
  }

  async runRealLifecycle(session: SessionEntity, fetchImpl?: typeof fetch): Promise<void> {
    let s = session;
    const send = this.makeSender(() => s, fetchImpl);
    const telephony = this.providers.telephonyProvider();
    const ai = this.providers.aiProvider();
    const artifacts: RealRuntimeArtifacts = {
      transcriptDeltas: [],
      transcriptFinal: null,
      summary: null,
      classification: null,
      completionReason: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    let terminalSent = false;
    /** Ref so TS tracks updates from async callbacks (plain `let` is narrowed incorrectly after `await` in the runtime loop). */
    const forcedTerminalRef: {
      current: { status: "completed" | "failed"; reason: string } | null;
    } = { current: null };
    let mediaSessionId: string | null = null;
    let mediaDisconnected = false;
    let aiHandle: { openaiSessionId: string } | null = null;
    let providerCallId: string | null = null;
    let cleanupAiLifecycle: (() => void) | undefined;
    let cleanupAiArtifacts: (() => void) | undefined;
    let cleanupMediaLifecycle: (() => void) | undefined;

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
    providerCallId = leg.providerCallId;
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
      if (event.state === "failed") {
        forcedTerminalRef.current = { status: "failed", reason: event.reason ?? "telephony_failed" };
      }
      if (event.state === "completed") {
        forcedTerminalRef.current = { status: "completed", reason: event.reason ?? "telephony_completed" };
      }
    });

    try {
      const ringingReached = await this.waitForTelephonyState(telephony, leg.providerCallId, "ringing");
      if (ringingReached.ok && ringingReached.skippedRinging !== true) {
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

    try {
      await send({
        eventType: "attempt.ai.connecting",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { phase: "ai_connecting" },
      });

      aiHandle = await ai.createSession({
        externalSessionId: s.externalSessionId,
        attemptId: s.attemptId,
      });
      await ai.sendContext(aiHandle, s.context);
      this.registry.patch(s.externalSessionId, {
        correlationIds: { ...s.correlationIds, openaiCallId: aiHandle.openaiSessionId },
        providerSessionId: s.providerSessionId ?? aiHandle.openaiSessionId,
      });
      s = this.registry.get(s.externalSessionId)!;

      const aiLifecycle = ai as unknown as {
        onSessionLifecycle?: (
          handle: { openaiSessionId: string },
          listener: (event: { type: "connected" | "disconnected" | "error"; reason?: string }) => void,
        ) => () => void;
      };
      if (aiLifecycle.onSessionLifecycle) {
        cleanupAiLifecycle = aiLifecycle.onSessionLifecycle(aiHandle, (event) => {
          if (event.type === "disconnected" && !mediaDisconnected) {
            forcedTerminalRef.current = { status: "failed", reason: event.reason ?? "ai_disconnected" };
          }
          if (event.type === "error") {
            forcedTerminalRef.current = { status: "failed", reason: event.reason ?? "ai_error" };
          }
        });
      }

      const aiArtifacts = ai as unknown as {
        onRuntimeArtifact?: (
          handle: { openaiSessionId: string },
          listener: (event: {
            type: "transcript_delta" | "transcript_final" | "summary" | "classification";
            delta?: string;
            transcript?: string;
            summary?: string;
            outcomeKey?: string;
            fields?: Record<string, unknown>;
          }) => void,
        ) => () => void;
      };
      if (aiArtifacts.onRuntimeArtifact) {
        cleanupAiArtifacts = aiArtifacts.onRuntimeArtifact(aiHandle, (event) => {
          if (terminalSent) return;
          if (event.type === "transcript_delta" && event.delta) {
            artifacts.transcriptDeltas.push(event.delta);
            if (artifacts.transcriptDeltas.length > 200) artifacts.transcriptDeltas.shift();
          }
          if (event.type === "transcript_final" && event.transcript) {
            artifacts.transcriptFinal = event.transcript.trim();
          }
          if (event.type === "summary" && event.summary) {
            artifacts.summary = event.summary.trim();
          }
          if (event.type === "classification" && event.outcomeKey) {
            artifacts.classification = {
              outcomeKey: event.outcomeKey.trim(),
              fields: event.fields ?? {},
            };
          }
        });
      }

      await ai.startConversation(aiHandle);

      const media = await this.realMediaBridge.connect({
        externalSessionId: s.externalSessionId,
        providerCallId: leg.providerCallId,
        aiSessionId: aiHandle.openaiSessionId,
        telephony,
        ai,
      });
      mediaSessionId = media.id;
      cleanupMediaLifecycle = this.realMediaBridge.onLifecycleEvent((event) => {
        if (event.sessionId !== media.id) return;
        if (event.type === "error") {
          forcedTerminalRef.current = { status: "failed", reason: event.reason ?? "media_error" };
        }
        if (event.type === "disconnected" && event.reason === "reconnect_exhausted") {
          forcedTerminalRef.current = { status: "failed", reason: "media_reconnect_exhausted" };
        }
        if (event.type === "disconnected") {
          mediaDisconnected = true;
        }
      });

      this.registry.transition(s.externalSessionId, "ai_active", "ai_started");
      s = this.registry.get(s.externalSessionId)!;
      await send({
        eventType: "attempt.ai.connected",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: { phase: "ai_connected" },
      });

      const runtimeStartedAt = Date.now();
      while (Date.now() - runtimeStartedAt < this.config.callMaxDurationSec * 1000) {
        const pendingTerminal = forcedTerminalRef.current;
        if (pendingTerminal) {
          await this.finalizeRealTerminal(
            pendingTerminal.status,
            pendingTerminal.reason,
            artifacts,
            () => s,
            send,
            () => {
              terminalSent = true;
            },
          );
          break;
        }
        const callStatus = await telephony.getCallStatus(leg.providerCallId);
        if (callStatus.status === "failed") {
          await this.finalizeRealTerminal(
            "failed",
            callStatus.reason ?? "provider_failed",
            artifacts,
            () => s,
            send,
            () => {
              terminalSent = true;
            },
          );
          break;
        }
        if (callStatus.status === "completed") {
          await this.finalizeRealTerminal(
            "completed",
            callStatus.reason ?? "provider_completed",
            artifacts,
            () => s,
            send,
            () => {
              terminalSent = true;
            },
          );
          break;
        }
        await sleep(400);
      }

      if (!terminalSent) {
        await this.finalizeRealTerminal(
          "failed",
          "runtime_timeout",
          artifacts,
          () => s,
          send,
          () => {
            terminalSent = true;
          },
        );
      }
    } finally {
      cleanupMediaLifecycle?.();
      cleanupAiLifecycle?.();
      cleanupAiArtifacts?.();
      if (aiHandle) {
        await ai.closeSession(aiHandle).catch(() => undefined);
      }
      if (providerCallId) {
        await telephony.hangupCall(providerCallId).catch((err) => {
          this.log.warn("telephony_hangup_failed", { providerCallId, error: String(err) });
        });
      }
      if (mediaSessionId) {
        await this.realMediaBridge.close(mediaSessionId).catch(() => undefined);
      }
    }
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
  ): Promise<{ ok: true; skippedRinging?: boolean } | { ok: false; reason?: string }> {
    const started = Date.now();
    while (Date.now() - started < this.config.callMaxDurationSec * 1000) {
      const status = await telephony.getCallStatus(providerCallId);
      if (target === "ringing") {
        if (status.status === "ringing") return { ok: true };
        if (status.status === "answered") return { ok: true, skippedRinging: true };
        if (status.status === "failed" || status.status === "completed") {
          return { ok: false, reason: status.reason ?? status.status };
        }
        await sleep(400);
        continue;
      }
      if (status.status === target) return { ok: true };
      if (status.status === "failed" || status.status === "completed") {
        return { ok: false, reason: status.reason ?? status.status };
      }
      await sleep(400);
    }
    return { ok: false, reason: "answer_timeout" };
  }

  private async finalizeRealTerminal(
    terminalStatus: "completed" | "failed",
    reason: string,
    artifacts: RealRuntimeArtifacts,
    sessionRef: () => SessionEntity,
    send: (
      partial: Omit<GatewayOutboundEvent, "deliveryId" | "occurredAt" | "correlationIds"> & {
        deliveryId?: string;
      },
    ) => Promise<void>,
    markSent: () => void,
  ): Promise<void> {
    const s = sessionRef();
    if (s.lifecycleStatus === "completed" || s.lifecycleStatus === "failed") return;
    markSent();
    artifacts.completionReason = reason;
    artifacts.completedAt = new Date().toISOString();
    const transcript = (artifacts.transcriptFinal ?? artifacts.transcriptDeltas.join("")).trim();
    if (transcript) {
      await send({
        eventType: "attempt.transcript.final",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        transcript,
        payload: { transcript, source: "runtime" },
      });
    }
    if (artifacts.classification?.outcomeKey) {
      await send({
        eventType: "attempt.classification.ready",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        outcomeKey: artifacts.classification.outcomeKey,
        fields: artifacts.classification.fields,
        payload: {
          outcomeKey: artifacts.classification.outcomeKey,
          fields: artifacts.classification.fields,
          source: "runtime",
        },
      });
    }
    if (artifacts.summary) {
      await send({
        eventType: "attempt.summary.ready",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        summary: artifacts.summary,
        payload: { summary: artifacts.summary, source: "runtime" },
      });
    }
    const missingArtifacts = [
      transcript ? null : "transcript",
      artifacts.summary ? null : "summary",
      artifacts.classification?.outcomeKey ? null : "classification",
    ].filter((x): x is string => Boolean(x));

    if (terminalStatus === "completed") {
      await send({
        eventType: "attempt.completed",
        attemptId: s.attemptId,
        providerSessionId: s.providerSessionId,
        externalSessionId: s.externalSessionId,
        payload: {
          done: true,
          providerMode: this.config.gatewayProviderMode,
          completionReason: reason,
          artifacts: {
            source: "runtime",
            degraded: missingArtifacts.length > 0,
            missing: missingArtifacts,
            startedAt: artifacts.startedAt,
            completedAt: artifacts.completedAt,
          },
        },
      });
      this.registry.transition(s.externalSessionId, "completed", "complete");
      return;
    }
    await send({
      eventType: "attempt.failed",
      attemptId: s.attemptId,
      providerSessionId: s.providerSessionId,
      externalSessionId: s.externalSessionId,
      payload: {
        reason,
        artifacts: {
          source: "runtime",
          degraded: missingArtifacts.length > 0,
          missing: missingArtifacts,
          startedAt: artifacts.startedAt,
          completedAt: artifacts.completedAt,
        },
      },
      failureCode: "REAL_RUNTIME_FAILED",
      failureReason: reason,
    });
    this.registry.transition(s.externalSessionId, "failed", "fail");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
