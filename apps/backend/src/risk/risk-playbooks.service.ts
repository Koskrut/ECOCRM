import { Injectable, Logger } from "@nestjs/common";
import type { RiskBand, RiskDomainId, RiskSubjectType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SEED_PLAYBOOKS } from "./risk.constants";
import type { RiskScoreResult } from "./risk.types";

const BAND_RANK: Record<RiskBand, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

@Injectable()
export class RiskPlaybooksService {
  private readonly logger = new Logger(RiskPlaybooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureSeedPlaybooks() {
    for (const pb of SEED_PLAYBOOKS) {
      await this.prisma.riskPlaybook.upsert({
        where: { key: pb.key },
        create: {
          key: pb.key,
          domain: pb.domain,
          triggerBand: pb.triggerBand,
          actions: pb.actions as object,
        },
        update: {
          domain: pb.domain,
          triggerBand: pb.triggerBand,
          actions: pb.actions as object,
        },
      });
    }
  }

  async runForScores(scores: RiskScoreResult[]) {
    await this.ensureSeedPlaybooks();
    const playbooks = await this.prisma.riskPlaybook.findMany({ where: { enabled: true } });
    for (const score of scores) {
      if (BAND_RANK[score.band] < BAND_RANK.MEDIUM) continue;
      for (const pb of playbooks) {
        if (pb.domain !== score.domain) continue;
        if (BAND_RANK[score.band] < BAND_RANK[pb.triggerBand]) continue;
        const recent = await this.prisma.riskPlaybookRun.findFirst({
          where: {
            playbookId: pb.id,
            subjectType: score.subjectType,
            subjectId: score.subjectId,
            createdAt: { gte: new Date(Date.now() - pb.cooldownHours * 3600000) },
          },
        });
        if (recent) continue;
        await this.executePlaybook(pb.id, pb.domain, score.subjectType, score.subjectId, pb.actions as unknown[]);
      }
    }
  }

  private async executePlaybook(
    playbookId: string,
    domain: RiskDomainId,
    subjectType: RiskSubjectType,
    subjectId: string,
    actions: unknown[],
  ) {
    const run = await this.prisma.riskPlaybookRun.create({
      data: {
        playbookId,
        domain,
        subjectType,
        subjectId,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    const results: unknown[] = [];
    try {
      for (const action of actions) {
        const a = action as { type?: string; taskType?: string; role?: string };
        if (a.type === "CREATE_TASK" && a.taskType === "CONTROL_PAYMENT" && subjectType === "CONTACT") {
          const contact = await this.prisma.contact.findUnique({
            where: { id: subjectId },
            select: { ownerId: true },
          });
          const assigneeId = contact?.ownerId;
          if (!assigneeId) {
            results.push({ type: a.type, skipped: true, reason: "no_assignee" });
            continue;
          }
          const task = await this.prisma.task.create({
            data: {
              title: "Контроль оплати (Risk playbook)",
              assigneeId,
              contactId: subjectId,
              status: "OPEN",
              dueAt: new Date(),
            },
          });
          results.push({ type: a.type, taskId: task.id });
        } else {
          results.push({ type: a.type, skipped: true });
          this.logger.log(`Playbook action ${a.type} recorded for ${subjectType}:${subjectId}`);
        }
      }
      await this.prisma.riskPlaybookRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", completedAt: new Date(), result: results as object },
      });
    } catch (e) {
      await this.prisma.riskPlaybookRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          result: { error: e instanceof Error ? e.message : String(e) },
        },
      });
    }
  }
}
