import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { OutboundAttemptStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOUND_VOICE_PROVIDER } from "./outbound.constants";
import { LEGACY_COMPLETION_EVENT } from "./contracts/outbound-realtime-webhook-events";
import type { OutboundVoiceWebhookDto } from "./dto/outbound-voice-webhook.dto";
import { OutboundWritebackService, type OutboundOutcomeAnalysis } from "./outbound-writeback.service";
import type { OutboundPostCallAiResult } from "./outbound-post-call-analysis.service";
import { OutboundCallLinkService } from "./outbound-call-link.service";
import { OutboundPostCallAnalysisService } from "./outbound-post-call-analysis.service";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";
import { AiOutboundActionsService } from "./ai-outbound-actions.service";

@Injectable()
export class OutboundVoiceWebhookService {
  private readonly logger = new Logger(OutboundVoiceWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writeback: OutboundWritebackService,
    private readonly callLink: OutboundCallLinkService,
    private readonly postCallAi: OutboundPostCallAnalysisService,
    private readonly scenarios: ScenarioRegistryService,
    private readonly aiActions: AiOutboundActionsService,
  ) {}

  private async assertWebhookSecret(provided: string | undefined): Promise<void> {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OUTBOUND_VOICE_PROVIDER },
    });
    const expected =
      (row?.webhookSecret as string | null) ?? process.env.OUTBOUND_VOICE_WEBHOOK_SECRET ?? null;
    if (!expected || !provided || provided !== expected) {
      this.logger.warn("Outbound voice webhook secret mismatch or not configured");
      throw new UnauthorizedException("Invalid outbound voice webhook secret");
    }
  }

  async handleWebhook(
    providedSecret: string | undefined,
    dto: OutboundVoiceWebhookDto,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    await this.assertWebhookSecret(providedSecret);
    return this.processUnified(dto);
  }

  /** Server-side completion (stub/cron). Skips webhook secret — do not expose publicly. */
  async processCompletionInternal(
    dto: OutboundVoiceWebhookDto,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    return this.processUnified(dto);
  }

  private normalizeEventType(dto: OutboundVoiceWebhookDto): string {
    const t = dto.eventType?.trim();
    if (t) return t;
    return LEGACY_COMPLETION_EVENT;
  }

  private buildAttemptWhere(dto: OutboundVoiceWebhookDto): Prisma.OutboundCallAttemptWhereInput {
    const or: Prisma.OutboundCallAttemptWhereInput[] = [];
    if (dto.attemptId) or.push({ id: dto.attemptId });
    if (dto.providerSessionId) or.push({ providerSessionId: dto.providerSessionId });
    const ext = dto.correlationIds?.externalSessionId?.trim();
    if (ext) or.push({ externalSessionId: ext });
    if (or.length === 0) {
      throw new BadRequestException("Need attemptId, providerSessionId, or correlationIds.externalSessionId");
    }
    return { OR: or };
  }

  private async findAttemptForWebhook(dto: OutboundVoiceWebhookDto) {
    return this.prisma.outboundCallAttempt.findFirst({
      where: this.buildAttemptWhere(dto),
      include: { campaign: true },
    });
  }

  private async processUnified(dto: OutboundVoiceWebhookDto): Promise<{ ok: true; duplicate?: boolean }> {
    const eventType = this.normalizeEventType(dto);

    if (dto.deliveryId) {
      const dupEvt = await this.prisma.outboundRuntimeWebhookEvent.findUnique({
        where: { deliveryId: dto.deliveryId },
        select: { id: true },
      });
      if (dupEvt) {
        return { ok: true, duplicate: true };
      }
      const dupLegacy = await this.prisma.outboundCallAttempt.findFirst({
        where: { webhookProcessedId: dto.deliveryId },
        select: { id: true },
      });
      if (dupLegacy) {
        return { ok: true, duplicate: true };
      }
    }

    const attempt = await this.findAttemptForWebhook(dto);
    if (!attempt) {
      throw new NotFoundException("Outbound attempt not found for webhook identifiers");
    }

    const payload = dto.payload ?? {};
    const mergedFields = {
      ...(typeof payload === "object" && payload && "fields" in payload && typeof (payload as { fields?: unknown }).fields === "object"
        ? ((payload as { fields: Record<string, unknown> }).fields ?? {})
        : {}),
      ...(dto.fields ?? {}),
    };

    await this.prisma.outboundRuntimeWebhookEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        deliveryId: dto.deliveryId ?? null,
        payloadJson: { ...dto, payload: dto.payload } as object,
        source: "gateway",
      },
    });

    const now = new Date();
    const corr = dto.correlationIds;
    const correlationData: Prisma.OutboundCallAttemptUpdateInput = {
      lastRuntimeEventAt: now,
      lastRuntimeEventType: eventType,
      ...(corr?.externalSessionId ? { externalSessionId: corr.externalSessionId } : {}),
      ...(corr?.providerCallId ? { providerCallId: corr.providerCallId } : {}),
      ...(corr?.openaiCallId ? { openaiCallId: corr.openaiCallId } : {}),
      ...(corr?.recordingId ? { recordingExternalId: corr.recordingId } : {}),
    };

    if (eventType === "attempt.failed") {
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          status: OutboundAttemptStatus.FAILED,
          failureCode: dto.failureCode ?? (payload as { code?: string })?.code ?? "UNKNOWN",
          failureReason: dto.failureReason ?? (payload as { reason?: string })?.reason ?? "",
          lastError: `${dto.failureCode ?? "failed"}`.slice(0, 2000),
        },
      });
      return { ok: true };
    }

    if (
      eventType === "attempt.started" ||
      eventType === "attempt.ringing" ||
      eventType === "attempt.answered"
    ) {
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          status:
            attempt.status === OutboundAttemptStatus.COMPLETED
              ? attempt.status
              : OutboundAttemptStatus.DIALING,
        },
      });
      return { ok: true };
    }

    if (eventType === "attempt.transcript.partial") {
      const partial = (payload as { text?: string })?.text ?? dto.transcript ?? "";
      if (partial) {
        const prev = attempt.transcript ?? "";
        await this.prisma.outboundCallAttempt.update({
          where: { id: attempt.id },
          data: {
            ...correlationData,
            transcript: `${prev}${partial}`.slice(0, 100_000),
            transcriptStatus: "partial",
          },
        });
      } else {
        await this.prisma.outboundCallAttempt.update({ where: { id: attempt.id }, data: correlationData });
      }
      return { ok: true };
    }

    if (eventType === "attempt.transcript.final") {
      const text = (payload as { transcript?: string })?.transcript ?? dto.transcript ?? "";
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          transcript: text.slice(0, 100_000),
          transcriptStatus: "final",
        },
      });
      return { ok: true };
    }

    if (eventType === "attempt.summary.ready") {
      const summary = (payload as { summary?: string })?.summary ?? dto.summary ?? "";
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          summary: summary.slice(0, 100_000),
          summaryStatus: "ready",
        },
      });
      return { ok: true };
    }

    if (eventType === "attempt.classification.ready") {
      const outcomeKeyFromPayload = (payload as { outcomeKey?: string })?.outcomeKey ?? dto.outcomeKey;
      const prevOutcome =
        attempt.outcome && typeof attempt.outcome === "object"
          ? (attempt.outcome as Record<string, unknown>)
          : {};
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          classificationStatus: "ready",
          outcome: {
            ...prevOutcome,
            outcomeKey: outcomeKeyFromPayload,
            fields: mergedFields,
          } as Prisma.InputJsonValue,
        },
      });
      return { ok: true };
    }

    if (eventType === "attempt.catalog.sent") {
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          catalogSentAt: now,
        },
      });
      try {
        await this.aiActions.sendCatalogToContact(attempt.id);
      } catch (e) {
        this.logger.warn(`catalog.sent action: ${e instanceof Error ? e.message : String(e)}`);
      }
      return { ok: true };
    }

    if (eventType === "attempt.transfer.requested" || eventType === "attempt.transferred") {
      await this.prisma.outboundCallAttempt.update({
        where: { id: attempt.id },
        data: {
          ...correlationData,
          transferStatus: eventType === "attempt.transferred" ? "completed" : "requested",
        },
      });
      if (eventType === "attempt.transfer.requested") {
        try {
          await this.aiActions.assignManagerCallbackTask(attempt.id);
        } catch (e) {
          this.logger.warn(`transfer.requested task: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { ok: true };
    }

    if (eventType === LEGACY_COMPLETION_EVENT || eventType === "attempt.completed") {
      return this.runCompletionFlow(attempt, dto, mergedFields);
    }

    this.logger.debug(`Unhandled outbound event type ${eventType}, metadata stored`);
    await this.prisma.outboundCallAttempt.update({
      where: { id: attempt.id },
      data: correlationData,
    });
    return { ok: true };
  }

  private async runCompletionFlow(
    attempt: Awaited<ReturnType<OutboundVoiceWebhookService["findAttemptForWebhook"]>>,
    dto: OutboundVoiceWebhookDto,
    mergedFields: Record<string, unknown>,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    if (!attempt) throw new NotFoundException("attempt");
    if (dto.deliveryId) {
      const dup = await this.prisma.outboundCallAttempt.findFirst({
        where: { webhookProcessedId: dto.deliveryId },
        select: { id: true },
      });
      if (dup) {
        return { ok: true, duplicate: true };
      }
    }
    if (attempt.status === OutboundAttemptStatus.COMPLETED) {
      return { ok: true, duplicate: true };
    }

    const providerSessionId = dto.providerSessionId ?? attempt.providerSessionId ?? "";
    await this.callLink.linkAttemptToCallIfPresent(
      attempt.id,
      dto.externalCallId,
      dto.callProvider,
    );

    const scenario = this.scenarios.resolve(attempt.scenarioCode, attempt.scenarioVersion);
    const isStubDelivery = (dto.deliveryId ?? "").startsWith("stub-");
    const payload = dto.payload ?? {};
    const transcript =
      dto.transcript ??
      (typeof (payload as { transcript?: string }).transcript === "string"
        ? (payload as { transcript?: string }).transcript
        : "") ??
      "";
    const transcriptTrim = transcript.trim();

    let outcomeKey = dto.outcomeKey?.trim() ?? (payload as { outcomeKey?: string }).outcomeKey?.trim() ?? "";
    const initialSummary =
      dto.summary?.trim() ??
      (typeof (payload as { summary?: string }).summary === "string"
        ? (payload as { summary?: string }).summary
        : "") ??
      "";
    let summary = initialSummary;
    let fields: Record<string, unknown> = { ...mergedFields };

    const initialOutcomeValid =
      Boolean(outcomeKey) && Boolean(this.scenarios.findOutcomeMapping(scenario, outcomeKey));

    const aiInvoked = Boolean(transcriptTrim && (!initialOutcomeValid || !initialSummary));

    let postAi: OutboundPostCallAiResult | null = null;
    let aiCaught = false;

    if (aiInvoked) {
      try {
        postAi = await this.postCallAi.analyzeFromTranscript({
          scenario,
          transcript: transcriptTrim,
          fixedOutcomeKey: initialOutcomeValid ? outcomeKey : undefined,
        });
        if (!initialOutcomeValid) outcomeKey = postAi.outcomeKey;
        if (!initialSummary) summary = postAi.summary;
        fields = { ...postAi.fields, ...fields };
      } catch (e) {
        aiCaught = true;
        this.logger.warn(`Post-call AI error: ${e instanceof Error ? e.message : String(e)}`);
        if (!initialOutcomeValid) outcomeKey = "NO_ANSWER";
        if (!initialSummary) summary = "Помилка AI-аналізу дзвінка.";
      }
    }

    if (!outcomeKey || !this.scenarios.findOutcomeMapping(scenario, outcomeKey)) {
      outcomeKey = "NO_ANSWER";
    }
    if (!summary) {
      summary = `Outcome: ${outcomeKey}`;
    }

    const analysis: OutboundOutcomeAnalysis = (() => {
      if (isStubDelivery) {
        return { analysisSource: "INTERNAL_STUB", needsReview: false, aiConfidence: null };
      }
      if (!aiInvoked) {
        return {
          analysisSource: "WEBHOOK_ONLY",
          needsReview: !initialOutcomeValid,
          aiConfidence: null,
        };
      }
      if (aiCaught) {
        return {
          analysisSource: initialOutcomeValid ? "AI_SUPPLEMENT" : "AI_CLASSIFY",
          needsReview: true,
          aiConfidence: null,
        };
      }
      return {
        analysisSource: initialOutcomeValid ? "AI_SUPPLEMENT" : "AI_CLASSIFY",
        needsReview: Boolean(postAi?.usedFallbackOutcome),
        aiConfidence: postAi?.aiConfidence ?? null,
      };
    })();

    await this.writeback.applyPostCallWriteback(
      attempt.id,
      {
        outcomeKey,
        summary,
        transcript: transcriptTrim || undefined,
        fields,
        analysis,
      },
      { deliveryId: dto.deliveryId },
    );

    return { ok: true };
  }
}
