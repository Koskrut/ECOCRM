import { Injectable, Logger } from "@nestjs/common";
import {
  ActivityType,
  LeadEventType,
  OutboundAttemptStatus,
  type OutboundCallAttempt,
  type OutboundCampaign,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { OutcomeCrmAction } from "./scenarios/scenario.types";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";
import { OutboundComplianceService } from "./outbound-compliance.service";

/** Stored under OutboundCallAttempt.outcome.analysis (JSON, no migration). */
export type OutboundOutcomeAnalysis = {
  analysisSource: "WEBHOOK_ONLY" | "AI_SUPPLEMENT" | "AI_CLASSIFY" | "INTERNAL_STUB";
  needsReview: boolean;
  aiConfidence: number | null;
};

export type OutboundWebhookOutcomePayload = {
  outcomeKey?: string;
  summary?: string;
  transcript?: string;
  fields?: Record<string, unknown>;
  analysis?: OutboundOutcomeAnalysis;
};

@Injectable()
export class OutboundWritebackService {
  private readonly logger = new Logger(OutboundWritebackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ScenarioRegistryService,
    private readonly compliance: OutboundComplianceService,
  ) {}

  async applyPostCallWriteback(
    attemptId: string,
    payload: OutboundWebhookOutcomePayload,
    opts?: { deliveryId?: string },
  ): Promise<void> {
    const attempt = await this.prisma.outboundCallAttempt.findUnique({
      where: { id: attemptId },
      include: { campaign: true },
    });
    if (!attempt) {
      this.logger.warn(`applyPostCallWriteback: attempt not found ${attemptId}`);
      return;
    }

    if (attempt.status === OutboundAttemptStatus.COMPLETED) {
      this.logger.debug(`Attempt ${attemptId} already COMPLETED, skipping write-back`);
      return;
    }

    const scenario = this.scenarios.resolve(attempt.scenarioCode, attempt.scenarioVersion);
    const outcomeKey = payload.outcomeKey ?? "NO_ANSWER";
    const mapping = this.scenarios.findOutcomeMapping(scenario, outcomeKey);
    if (!mapping) {
      this.logger.warn(`No outcome mapping for ${outcomeKey} in ${scenario.code}@${scenario.version}`);
    }

    const crm: OutcomeCrmAction | null = mapping?.crm ?? null;
    const summaryText =
      payload.summary?.trim() ||
      (payload.fields ? JSON.stringify(payload.fields, null, 2) : "") ||
      `Outcome: ${outcomeKey}`;

    const analysis: OutboundOutcomeAnalysis = payload.analysis ?? {
      analysisSource: "WEBHOOK_ONLY",
      needsReview: false,
      aiConfidence: null,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.outboundCallAttempt.update({
        where: { id: attemptId },
        data: {
          status: OutboundAttemptStatus.COMPLETED,
          transcript: payload.transcript ?? null,
          summary: summaryText,
          ...(opts?.deliveryId ? { webhookProcessedId: opts.deliveryId } : {}),
          outcome: {
            outcomeKey,
            fields: payload.fields ?? {},
            bucket: crm?.bucket,
            analysis: {
              analysisSource: analysis.analysisSource,
              needsReview: analysis.needsReview,
              aiConfidence: analysis.aiConfidence,
            },
          } as object,
        },
      });

      if (!crm) return;

      const activityBody = [
        summaryText,
        payload.transcript ? `\n---\nТранскрипт (скорочено):\n${payload.transcript.slice(0, 4000)}` : "",
      ]
        .join("")
        .slice(0, 12000);

      if (crm.createActivityComment) {
        const title = crm.activityTitleTemplate ?? "AI outbound дзвінок";
        await tx.activity.create({
          data: {
            type: ActivityType.COMMENT,
            title,
            body: activityBody,
            createdBy: "system",
            leadId: attempt.leadId,
            contactId: attempt.contactId,
            companyId: attempt.companyId,
          },
        });
      }

      if (crm.appendLeadEventNote && attempt.leadId) {
        await tx.leadEvent.create({
          data: {
            leadId: attempt.leadId,
            type: LeadEventType.NOTE,
            message: `[AI outbound] ${summaryText}`.slice(0, 2000),
          },
        });
      }

      if (crm.createFollowUpTask) {
        const assigneeId = await this.resolveAssigneeId(tx, attempt, crm);
        if (!assigneeId) {
          this.logger.warn(`No assignee for follow-up task (attempt ${attemptId}), skipping Task`);
        } else {
          const due = new Date(
            Date.now() + (crm.taskDueHoursFromNow ?? 24) * 60 * 60 * 1000,
          );
          await tx.task.create({
            data: {
              assigneeId,
              title: (crm.taskTitleTemplate ?? "Follow-up").slice(0, 500),
              body: crm.taskBodyTemplate ?? summaryText.slice(0, 4000),
              dueAt: due,
              leadId: attempt.leadId,
              contactId: attempt.contactId,
              companyId: attempt.companyId,
            },
          });
        }
      }
    });
  }

  private async resolveAssigneeId(
    tx: Prisma.TransactionClient,
    attempt: OutboundCallAttempt & { campaign: OutboundCampaign },
    crm: OutcomeCrmAction,
  ): Promise<string | null> {
    if (crm.assignTaskToLeadOwner && attempt.leadId) {
      const lead = await tx.lead.findUnique({
        where: { id: attempt.leadId },
        select: { ownerId: true },
      });
      if (lead?.ownerId) return lead.ownerId;
    }
    if (crm.assignTaskToContactOwner && attempt.contactId) {
      const c = await tx.contact.findUnique({
        where: { id: attempt.contactId },
        select: { ownerId: true },
      });
      if (c?.ownerId) return c.ownerId;
    }
    if (crm.assignTaskToCampaignDefault) {
      const cfg = this.compliance.parseCampaignConfig(attempt.campaign);
      if (cfg.defaultAssigneeUserId) return cfg.defaultAssigneeUserId;
    }
    return null;
  }
}
