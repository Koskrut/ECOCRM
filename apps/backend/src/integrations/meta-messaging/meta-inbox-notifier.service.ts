import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ConversationChannel, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";

const DEBOUNCE_MS = 2 * 60 * 1000;
const PREVIEW_MAX_LEN = 200;

@Injectable()
export class MetaInboxNotifierService {
  private readonly logger = new Logger(MetaInboxNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async notifyInboundMessage(params: {
    conversationId: string;
    channel: ConversationChannel;
    participantLabel: string;
    messageText: string | null;
  }): Promise<void> {
    if (!this.notifications) return;

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
        metaParticipant: {
          select: { displayName: true },
        },
      },
    });
    if (!conversation) return;

    const recipientIds = await this.resolveRecipientUserIds(conversation);
    if (recipientIds.length === 0) return;

    const channelLabel =
      params.channel === ConversationChannel.INSTAGRAM ? "Instagram" : "Facebook";
    const title = `${channelLabel}: ${this.clientDisplayName(params.participantLabel, conversation)}`;
    const body = this.buildBodyPreview(params.messageText);
    const notificationType =
      params.channel === ConversationChannel.INSTAGRAM
        ? "META_INSTAGRAM_MESSAGE"
        : "META_FACEBOOK_MESSAGE";
    const meta = {
      conversationId: params.conversationId,
      channel: params.channel,
      messagePreview: body,
    };

    for (const userId of recipientIds) {
      try {
        await this.notifyUserDebounced({
          userId,
          conversationId: params.conversationId,
          notificationType,
          title,
          body,
          meta,
        });
      } catch (err) {
        this.logger.warn(
          `Meta inbox notification failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
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
    if (ownerId) return [ownerId];

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private clientDisplayName(
    fallback: string,
    conversation: {
      contact: { firstName: string | null; lastName: string | null; phone: string | null } | null;
      lead: {
        fullName: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      metaParticipant: { displayName: string | null } | null;
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
    if (conversation.metaParticipant?.displayName?.trim()) {
      return conversation.metaParticipant.displayName.trim();
    }
    return fallback;
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
    notificationType: "META_INSTAGRAM_MESSAGE" | "META_FACEBOOK_MESSAGE";
    title: string;
    body: string;
    meta: Record<string, unknown>;
  }): Promise<void> {
    const since = new Date(Date.now() - DEBOUNCE_MS);
    const existing = await this.prisma.userNotification.findFirst({
      where: {
        userId: params.userId,
        type: params.notificationType,
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
      type: params.notificationType,
      title: params.title,
      body: params.body,
      entityType: "CONVERSATION",
      entityId: params.conversationId,
      meta: params.meta,
    });
  }
}
