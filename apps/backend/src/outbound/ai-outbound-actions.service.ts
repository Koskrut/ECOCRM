import { Injectable, Logger } from "@nestjs/common";
import { ActivityType, OutboundAttemptStatus, type OutboundCampaign, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "../integrations/telegram/telegram.service";
import { OutboundComplianceService } from "./outbound-compliance.service";
import { OUTBOUND_VOICE_PROVIDER } from "./outbound.constants";

@Injectable()
export class AiOutboundActionsService {
  private readonly logger = new Logger(AiOutboundActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly compliance: OutboundComplianceService,
  ) {}

  async getClientContextForAiCall(attemptId: string) {
    return this.prisma.outboundCallAttempt.findUnique({
      where: { id: attemptId },
      include: {
        campaign: true,
        lead: { include: { owner: { select: { id: true, fullName: true } } } },
        contact: { include: { owner: { select: { id: true, fullName: true } }, telegramAccounts: true } },
      },
    });
  }

  async writeAiCallActivityComment(attemptId: string, title: string, body: string): Promise<void> {
    const attempt = await this.prisma.outboundCallAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) return;
    await this.prisma.activity.create({
      data: {
        type: ActivityType.COMMENT,
        title: title.slice(0, 500),
        body: body.slice(0, 12000),
        createdBy: "system",
        leadId: attempt.leadId,
        contactId: attempt.contactId,
        companyId: attempt.companyId,
      },
    });
  }

  async createFollowUpTaskFromAiCall(args: {
    attemptId: string;
    title: string;
    body: string;
    dueHoursFromNow: number;
  }): Promise<void> {
    const attempt = await this.prisma.outboundCallAttempt.findUnique({
      where: { id: args.attemptId },
      include: { campaign: true },
    });
    if (!attempt) return;
    const assigneeId = await this.resolveAssigneeForAttempt(attempt);
    if (!assigneeId) {
      this.logger.warn(`No assignee for AI follow-up task (attempt ${args.attemptId})`);
      return;
    }
    const due = new Date(Date.now() + args.dueHoursFromNow * 60 * 60 * 1000);
    await this.prisma.task.create({
      data: {
        assigneeId,
        title: args.title.slice(0, 500),
        body: args.body.slice(0, 4000),
        dueAt: due,
        leadId: attempt.leadId,
        contactId: attempt.contactId,
        companyId: attempt.companyId,
      },
    });
  }

  async assignManagerCallbackTask(attemptId: string): Promise<void> {
    await this.createFollowUpTaskFromAiCall({
      attemptId,
      title: "Колбек менеджера (AI outbound)",
      body: "Клієнт попросив зворотний дзвінок під час AI-дзвінка.",
      dueHoursFromNow: 4,
    });
  }

  async markAiCallOutcome(attemptId: string, outcomePatch: Record<string, unknown>): Promise<void> {
    const row = await this.prisma.outboundCallAttempt.findUnique({ where: { id: attemptId } });
    if (!row) return;
    const prev = (row.outcome && typeof row.outcome === "object" ? row.outcome : {}) as Record<string, unknown>;
    await this.prisma.outboundCallAttempt.update({
      where: { id: attemptId },
      data: {
        outcome: { ...prev, ...outcomePatch } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Sends catalog link via Telegram when linked; otherwise records intent (activity + task).
   */
  async sendCatalogToContact(attemptId: string): Promise<{ sent: boolean; channel?: string; detail?: string }> {
    const attempt = await this.prisma.outboundCallAttempt.findUnique({
      where: { id: attemptId },
      include: {
        campaign: true,
        contact: { include: { telegramAccounts: { take: 1 } } },
      },
    });
    if (!attempt?.contactId || !attempt.contact) {
      await this.writeAiCallActivityComment(
        attemptId,
        "Каталог (AI)",
        "Запит на каталог зафіксовано; контакт не привʼязаний — потрібна ручна відправка.",
      );
      return { sent: false, detail: "no_contact" };
    }

    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OUTBOUND_VOICE_PROVIDER },
    });
    const cfg = (row?.config ?? {}) as { catalogDefaults?: { catalogUrl?: string; messageTemplate?: string } };
    const catalogUrl =
      cfg.catalogDefaults?.catalogUrl?.trim() ||
      process.env.OUTBOUND_CATALOG_PUBLIC_URL?.trim() ||
      "";

    const tg = attempt.contact.telegramAccounts[0];
    const textTemplate = cfg.catalogDefaults?.messageTemplate ?? "Каталог: {{url}}";
    const message = textTemplate.replace("{{url}}", catalogUrl || "(URL не налаштовано)");

    if (tg?.telegramChatId && catalogUrl) {
      try {
        await this.telegram.sendMessageToChat(tg.telegramChatId, message);
        return { sent: true, channel: "telegram" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`sendCatalogToContact telegram failed: ${msg}`);
        await this.writeAiCallActivityComment(
          attemptId,
          "Каталог (AI) — помилка Telegram",
          `Не вдалося надіслати в Telegram: ${msg}\nТекст: ${message}`,
        );
        return { sent: false, detail: msg };
      }
    }

    await this.writeAiCallActivityComment(
      attemptId,
      "Каталог (AI) — задача менеджеру",
      catalogUrl
        ? `Клієнт запросив каталог. URL: ${catalogUrl}\nКанал Telegram недоступний або не привʼязаний.`
        : "Клієнт запросив каталог. Налаштуйте catalogDefaults.catalogUrl або OUTBOUND_CATALOG_PUBLIC_URL.",
    );
    await this.createFollowUpTaskFromAiCall({
      attemptId,
      title: "Надіслати каталог клієнту (AI)",
      body: catalogUrl ? `Надішліть каталог: ${catalogUrl}` : "Надішліть каталог клієнту (URL не задано в налаштуваннях).",
      dueHoursFromNow: 24,
    });
    return { sent: false, detail: "manager_task" };
  }

  private async resolveAssigneeForAttempt(
    attempt: { leadId: string | null; contactId: string | null; campaign: OutboundCampaign },
  ): Promise<string | null> {
    if (attempt.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: attempt.leadId },
        select: { ownerId: true },
      });
      if (lead?.ownerId) return lead.ownerId;
    }
    if (attempt.contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: attempt.contactId },
        select: { ownerId: true },
      });
      if (c?.ownerId) return c.ownerId;
    }
    const cfg = this.compliance.parseCampaignConfig(attempt.campaign);
    if (cfg.defaultAssigneeUserId) return cfg.defaultAssigneeUserId;
    return null;
  }

  async recordAttemptFailure(attemptId: string, code: string, reason: string): Promise<void> {
    await this.prisma.outboundCallAttempt.update({
      where: { id: attemptId },
      data: {
        status: OutboundAttemptStatus.FAILED,
        failureCode: code.slice(0, 64),
        failureReason: reason.slice(0, 2000),
        lastError: `${code}: ${reason}`.slice(0, 2000),
      },
    });
  }
}
