import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  ConversationChannel,
  ConversationStatus,
  LeadChannel,
  LeadSource,
  LeadStatus,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { parseMetaInboundMessages } from "./meta-messaging.parse";
import type { MetaMessagingWebhookBody } from "./meta-messaging.types";
import { MetaInboxNotifierService } from "./meta-inbox-notifier.service";

@Injectable()
export class MetaMessagingService {
  private readonly logger = new Logger(MetaMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly inboxNotifier: MetaInboxNotifierService,
  ) {}

  async handleInboundWebhook(body: MetaMessagingWebhookBody): Promise<{ ok: true; processed: number }> {
    const messages = parseMetaInboundMessages(body);
    let processed = 0;

    for (const inbound of messages) {
      const eventKey = `${inbound.channel}:${inbound.messageId}`;
      try {
        await this.prisma.metaInboundEvent.create({ data: { eventKey } });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) continue;
        throw error;
      }

      try {
        await this.persistInboundMessage(inbound);
        processed += 1;
      } catch (error) {
        await this.prisma.metaInboundEvent.deleteMany({ where: { eventKey } });
        throw error;
      }
    }

    return { ok: true, processed };
  }

  private async persistInboundMessage(inbound: {
    channel: ConversationChannel;
    pageId: string;
    participantId: string;
    messageId: string;
    text: string | null;
    sentAt: Date;
    senderName?: string | null;
  }): Promise<void> {
    const now = new Date();
    const participant = await this.upsertParticipant({
      platform: inbound.channel,
      participantId: inbound.participantId,
      displayName: inbound.senderName ?? null,
      lastMessageAt: now,
    });

    let contactId = participant.contactId;
    let leadId = participant.leadId;

    if (!contactId && !leadId) {
      const linked = await this.autoLinkOrCreateLead(participant.id, inbound.channel);
      contactId = linked.contactId;
      leadId = linked.leadId;
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        channel: inbound.channel,
        metaParticipantId: participant.id,
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          channel: inbound.channel,
          metaParticipantId: participant.id,
          contactId,
          leadId,
          status: ConversationStatus.OPEN,
          lastMessageAt: inbound.sentAt,
        },
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: inbound.sentAt,
          status: ConversationStatus.OPEN,
          ...(contactId ? { contactId } : {}),
          ...(leadId && !conversation.contactId ? { leadId } : {}),
        },
      });
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        text: inbound.text,
        externalMessageId: inbound.messageId,
        sentAt: inbound.sentAt,
      },
    });

    await this.inboxNotifier.notifyInboundMessage({
      conversationId: conversation.id,
      channel: inbound.channel,
      participantLabel: inbound.participantId,
      messageText: inbound.text,
    });
  }

  private async upsertParticipant(params: {
    platform: ConversationChannel;
    participantId: string;
    displayName: string | null;
    lastMessageAt: Date;
  }) {
    return this.prisma.metaParticipant.upsert({
      where: {
        platform_participantId: {
          platform: params.platform,
          participantId: params.participantId,
        },
      },
      create: {
        platform: params.platform,
        participantId: params.participantId,
        displayName: params.displayName,
        lastMessageAt: params.lastMessageAt,
      },
      update: {
        lastMessageAt: params.lastMessageAt,
        ...(params.displayName ? { displayName: params.displayName } : {}),
      },
    });
  }

  private async autoLinkOrCreateLead(
    participantId: string,
    channel: ConversationChannel,
  ): Promise<{ contactId: string | null; leadId: string | null }> {
    const secrets = await this.settings.getMetaMessagingSecrets();
    const companyId =
      secrets.leadCompanyId ||
      process.env.META_MESSAGING_LEAD_COMPANY_ID?.trim() ||
      (await this.prisma.company.findFirst({ select: { id: true } }))?.id;

    if (!companyId) return { contactId: null, leadId: null };

    const source =
      channel === ConversationChannel.INSTAGRAM ? LeadSource.INSTAGRAM : LeadSource.FACEBOOK;
    const leadChannel =
      channel === ConversationChannel.INSTAGRAM ? LeadChannel.IG_DM : LeadChannel.FB_DM;
    const label = channel === ConversationChannel.INSTAGRAM ? "Instagram" : "Facebook";

    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        status: LeadStatus.NEW,
        source,
        channel: leadChannel,
        firstName: label,
        lastName: "DM",
        fullName: `${label} DM`,
        name: `${label} DM`,
        message: "Вхідне повідомлення з Meta inbox",
      },
    });

    await this.prisma.metaParticipant.update({
      where: { id: participantId },
      data: { leadId: lead.id },
    });

    return { contactId: null, leadId: lead.id };
  }

  async sendMessageToParticipant(
    channel: ConversationChannel,
    participantId: string,
    text: string,
    lastInboundAt?: Date | null,
  ): Promise<{ messageId: string }> {
    const secrets = await this.settings.getMetaMessagingSecrets();
    const pageId = secrets.pageId || process.env.META_MESSAGING_PAGE_ID?.trim();
    const pageAccessToken =
      secrets.pageAccessToken || process.env.META_MESSAGING_PAGE_ACCESS_TOKEN?.trim();
    if (!pageId || !pageAccessToken) {
      throw new BadRequestException(
        "Meta Messaging is not configured. Set Page ID and Page Access Token in Settings → Meta Messaging.",
      );
    }

    const graphVersion =
      process.env.META_GRAPH_API_VERSION?.trim() || secrets.graphApiVersion?.trim() || "v21.0";
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/messages`);
    url.searchParams.set("access_token", pageAccessToken);

    const useHumanAgent =
      lastInboundAt != null && Date.now() - lastInboundAt.getTime() > 24 * 60 * 60 * 1000;

    const body: Record<string, unknown> = {
      recipient: { id: participantId },
      message: { text },
    };
    if (useHumanAgent) {
      body.messaging_type = "MESSAGE_TAG";
      body.tag = "HUMAN_AGENT";
    } else {
      body.messaging_type = "RESPONSE";
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await res.json()) as { message_id?: string; error?: { message?: string } };
    if (!res.ok) {
      const msg = payload.error?.message ?? `Meta API error HTTP ${res.status}`;
      this.logger.warn(`Meta send failed: ${msg}`);
      throw new BadRequestException(msg);
    }

    const messageId = payload.message_id != null ? String(payload.message_id) : `local-${Date.now()}`;
    return { messageId };
  }

  async metaWebhookVerifySubscribe(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    if (mode !== "subscribe" || challenge == null || challenge === "") {
      throw new BadRequestException("Invalid Meta webhook verification request");
    }
    const secrets = await this.settings.getMetaMessagingSecrets();
    const expected =
      secrets.webhookVerifyToken?.trim() ||
      process.env.META_MESSAGING_WEBHOOK_VERIFY_TOKEN?.trim() ||
      "";
    if (!expected || token !== expected) {
      throw new BadRequestException("Invalid webhook verify token");
    }
    return challenge;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
