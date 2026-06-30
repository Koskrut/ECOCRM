import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";

const DEBOUNCE_MS = 2 * 60 * 1000;
const PREVIEW_MAX_LEN = 200;

@Injectable()
export class TelegramInboxNotifierService {
  private readonly logger = new Logger(TelegramInboxNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  shouldSkipNotification(text: string | null | undefined): boolean {
    const trimmed = text?.trim() ?? "";
    if (!trimmed) return false;
    if (/^\/link\s+\S+/i.test(trimmed)) return true;
    if (trimmed.toLowerCase() === "/help") return true;
    if (trimmed.toLowerCase() === "/start") return true;
    if (trimmed.toLowerCase().startsWith("/start") && trimmed.length <= 6) return true;
    return false;
  }

  async notifyInboundMessage(params: {
    conversationId: string;
    telegramChatId: string;
    messageText: string | null;
  }): Promise<void> {
    if (!this.notifications) return;
    if (this.shouldSkipNotification(params.messageText)) return;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        leadId: true,
        contact: {
          select: { firstName: true, lastName: true, phone: true },
        },
        lead: {
          select: {
            ownerId: true,
            fullName: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
    if (!conversation) return;

    const recipientIds = await this.resolveRecipientUserIds(conversation);
    if (recipientIds.length === 0) return;

    const title = this.buildTitle(params.telegramChatId, conversation);
    const body = this.buildBodyPreview(params.messageText);
    const meta = {
      conversationId: params.conversationId,
      telegramChatId: params.telegramChatId,
      messagePreview: body,
    };

    for (const userId of recipientIds) {
      try {
        await this.notifyUserDebounced({
          userId,
          conversationId: params.conversationId,
          title,
          body,
          meta,
        });
      } catch (err) {
        this.logger.warn(
          `Telegram inbox notification failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async resolveRecipientUserIds(conversation: {
    assignedToUserId: string | null;
    leadId: string | null;
    lead: { ownerId: string | null } | null;
  }): Promise<string[]> {
    if (conversation.assignedToUserId) {
      return [conversation.assignedToUserId];
    }

    const ownerId = conversation.lead?.ownerId;
    if (ownerId) {
      return [ownerId];
    }

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private buildTitle(
    telegramChatId: string,
    conversation: {
      contact: { firstName: string | null; lastName: string | null; phone: string | null } | null;
      lead: {
        fullName: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
    },
  ): string {
    const name = this.clientDisplayName(telegramChatId, conversation);
    return `Telegram: ${name}`;
  }

  private clientDisplayName(
    telegramChatId: string,
    conversation: {
      contact: { firstName: string | null; lastName: string | null; phone: string | null } | null;
      lead: {
        fullName: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
    },
  ): string {
    if (conversation.contact) {
      const full = [conversation.contact.lastName, conversation.contact.firstName]
        .filter(Boolean)
        .join(" ");
      if (full) return full;
      if (conversation.contact.phone) return conversation.contact.phone;
    }
    if (conversation.lead) {
      if (conversation.lead.fullName?.trim()) return conversation.lead.fullName.trim();
      const full = [conversation.lead.lastName, conversation.lead.firstName]
        .filter(Boolean)
        .join(" ");
      if (full) return full;
      if (conversation.lead.phone) return conversation.lead.phone;
    }
    return `Чат ${telegramChatId}`;
  }

  private buildBodyPreview(text: string | null | undefined): string {
    if (!text?.trim()) return "[медіа]";
    const trimmed = text.trim();
    if (trimmed.length <= PREVIEW_MAX_LEN) return trimmed;
    return `${trimmed.slice(0, PREVIEW_MAX_LEN)}…`;
  }

  private async notifyUserDebounced(params: {
    userId: string;
    conversationId: string;
    title: string;
    body: string;
    meta: Record<string, unknown>;
  }): Promise<void> {
    const since = new Date(Date.now() - DEBOUNCE_MS);
    const existing = await this.prisma.userNotification.findFirst({
      where: {
        userId: params.userId,
        type: "TELEGRAM_MESSAGE",
        entityType: "CONVERSATION",
        entityId: params.conversationId,
        readAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      await this.prisma.userNotification.update({
        where: { id: existing.id },
        data: {
          title: params.title,
          body: params.body,
          meta: params.meta as Prisma.InputJsonValue,
        },
      });
      return;
    }

    await this.notifications!.create({
      userId: params.userId,
      type: "TELEGRAM_MESSAGE",
      title: params.title,
      body: params.body,
      entityType: "CONVERSATION",
      entityId: params.conversationId,
      meta: params.meta,
    });
  }
}
