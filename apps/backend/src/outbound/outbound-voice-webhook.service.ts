import { Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { OutboundAttemptStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOUND_VOICE_PROVIDER } from "./outbound.constants";
import type { OutboundVoiceWebhookDto } from "./dto/outbound-voice-webhook.dto";
import { OutboundWritebackService, type OutboundOutcomeAnalysis } from "./outbound-writeback.service";
import type { OutboundPostCallAiResult } from "./outbound-post-call-analysis.service";
import { OutboundCallLinkService } from "./outbound-call-link.service";
import { OutboundPostCallAnalysisService } from "./outbound-post-call-analysis.service";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";

@Injectable()
export class OutboundVoiceWebhookService {
  private readonly logger = new Logger(OutboundVoiceWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writeback: OutboundWritebackService,
    private readonly callLink: OutboundCallLinkService,
    private readonly postCallAi: OutboundPostCallAnalysisService,
    private readonly scenarios: ScenarioRegistryService,
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
    return this.processDelivery(dto);
  }

  /** Server-side completion (stub/cron). Skips webhook secret — do not expose publicly. */
  async processCompletionInternal(
    dto: OutboundVoiceWebhookDto,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    return this.processDelivery(dto);
  }

  private async processDelivery(
    dto: OutboundVoiceWebhookDto,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    if (dto.deliveryId) {
      const dup = await this.prisma.outboundCallAttempt.findFirst({
        where: { webhookProcessedId: dto.deliveryId },
        select: { id: true },
      });
      if (dup) {
        return { ok: true, duplicate: true };
      }
    }

    const attempt = await this.prisma.outboundCallAttempt.findFirst({
      where: { providerSessionId: dto.providerSessionId },
      include: { campaign: true },
    });
    if (!attempt) {
      throw new NotFoundException("Outbound attempt not found for providerSessionId");
    }
    if (attempt.status === OutboundAttemptStatus.COMPLETED) {
      return { ok: true, duplicate: true };
    }

    await this.callLink.linkAttemptToCallIfPresent(
      attempt.id,
      dto.externalCallId,
      dto.callProvider,
    );

    const scenario = this.scenarios.resolve(attempt.scenarioCode, attempt.scenarioVersion);
    const isStubDelivery = (dto.deliveryId ?? "").startsWith("stub-");
    const transcript = dto.transcript?.trim() ?? "";
    let outcomeKey = dto.outcomeKey?.trim() ?? "";
    const initialSummary = dto.summary?.trim() ?? "";
    let summary = initialSummary;
    let fields: Record<string, unknown> = { ...(dto.fields ?? {}) };

    const initialOutcomeValid =
      Boolean(outcomeKey) && Boolean(this.scenarios.findOutcomeMapping(scenario, outcomeKey));

    const aiInvoked = Boolean(transcript && (!initialOutcomeValid || !initialSummary));

    let postAi: OutboundPostCallAiResult | null = null;
    let aiCaught = false;

    if (aiInvoked) {
      try {
        postAi = await this.postCallAi.analyzeFromTranscript({
          scenario,
          transcript,
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
        transcript: dto.transcript,
        fields,
        analysis,
      },
      { deliveryId: dto.deliveryId },
    );

    return { ok: true };
  }
}
