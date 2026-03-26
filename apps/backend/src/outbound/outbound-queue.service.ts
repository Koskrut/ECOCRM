import { Injectable, Logger } from "@nestjs/common";
import { OutboundAttemptStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CrmContextPackService } from "./crm-context-pack.service";
import { OutboundComplianceService } from "./outbound-compliance.service";
import { OutboundVoiceWebhookService } from "./outbound-voice-webhook.service";
import { SelectingVoiceRuntimeAdapter } from "./voice-runtime/selecting-voice-runtime.adapter";

const PROCESS_LIMIT = 15;

@Injectable()
export class OutboundQueueService {
  private readonly logger = new Logger(OutboundQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: OutboundComplianceService,
    private readonly contextPack: CrmContextPackService,
    private readonly voiceAdapter: SelectingVoiceRuntimeAdapter,
    private readonly voiceWebhook: OutboundVoiceWebhookService,
  ) {}

  async promotePendingToQueued(max: number = 100): Promise<number> {
    const pending = await this.prisma.outboundCallAttempt.findMany({
      where: {
        status: OutboundAttemptStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      take: max,
      orderBy: { createdAt: "asc" },
      include: { campaign: true, contact: true },
    });

    let promoted = 0;
    for (const a of pending) {
      if (!a.campaign.isActive) continue;
      if (this.compliance.isWithinQuietHours(a.campaign)) {
        this.logger.debug(`Skip attempt ${a.id}: quiet hours`);
        continue;
      }
      if (a.contactId && a.contact && !this.compliance.canCallContact(a.contact)) {
        await this.prisma.outboundCallAttempt.update({
          where: { id: a.id },
          data: {
            status: OutboundAttemptStatus.CANCELED,
            lastError: "marketingCallOptOut",
          },
        });
        continue;
      }

      await this.prisma.outboundCallAttempt.update({
        where: { id: a.id },
        data: { status: OutboundAttemptStatus.QUEUED },
      });
      promoted += 1;
    }
    return promoted;
  }

  async processQueuedDialAttempts(limit: number = PROCESS_LIMIT): Promise<number> {
    const queued = await this.prisma.outboundCallAttempt.findMany({
      where: {
        status: OutboundAttemptStatus.QUEUED,
        scheduledAt: { lte: new Date() },
      },
      take: limit,
      orderBy: { scheduledAt: "asc" },
      include: { campaign: true },
    });

    let processed = 0;
    for (const attempt of queued) {
      if (!attempt.campaign.isActive) continue;
      if (this.compliance.isWithinQuietHours(attempt.campaign)) continue;

      let pack: Record<string, unknown> = {};
      try {
        if (attempt.leadId) {
          pack = await this.contextPack.buildForLead(attempt.leadId);
        } else if (attempt.contactId) {
          pack = await this.contextPack.buildForDormantContact(attempt.contactId);
        }
      } catch (e) {
        this.logger.warn(`Context pack failed for attempt ${attempt.id}: ${e}`);
      }

      try {
        const result = await this.voiceAdapter.initiateOutboundCall(attempt, pack);
        await this.prisma.outboundCallAttempt.update({
          where: { id: attempt.id },
          data: {
            status: OutboundAttemptStatus.DIALING,
            provider: result.provider,
            runtimeProvider: result.provider,
            providerSessionId: result.providerSessionId,
          },
        });
        processed += 1;

        if (process.env.OUTBOUND_VOICE_STUB_AUTO_COMPLETE === "true") {
          const outcomeKey =
            process.env.OUTBOUND_VOICE_STUB_OUTCOME_KEY ?? "NO_ANSWER";
          const deliveryId = `stub-${attempt.id}-${result.providerSessionId}`;
          await this.voiceWebhook.processCompletionInternal({
            providerSessionId: result.providerSessionId,
            deliveryId,
            outcomeKey,
            summary: "Stub auto-complete (OUTBOUND_VOICE_STUB_AUTO_COMPLETE)",
            transcript: "",
            fields: {},
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.prisma.outboundCallAttempt.update({
          where: { id: attempt.id },
          data: {
            status: OutboundAttemptStatus.FAILED,
            lastError: msg.slice(0, 2000),
          },
        });
      }
    }
    return processed;
  }
}
