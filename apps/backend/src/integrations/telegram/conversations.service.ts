import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ConversationChannel, ConversationStatus } from "@prisma/client";
import { MessageDirection } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { normalizePagination } from "../../common/pagination";
import { ContactsService } from "../../contacts/contacts.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelegramAiService } from "./telegram-ai.service";
import { TelegramService } from "./telegram.service";
import type { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import type { ListMessagesQueryDto } from "./dto/list-messages-query.dto";

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly telegramAiService: TelegramAiService,
    private readonly contactsService: ContactsService,
  ) {}

  async list(q: ListConversationsQueryDto, actor: AuthUser | undefined) {
    const { page, pageSize, offset, limit } = normalizePagination(
      { page: q.page ?? 1, pageSize: q.pageSize ?? 20 },
      { page: 1, pageSize: 20 },
    );

    const where: {
      channel?: ConversationChannel;
      status?: ConversationStatus;
      assignedToUserId?: string | null;
    } = {};
    if (q.channel) where.channel = q.channel;
    if (q.status) where.status = q.status;
    if (q.assignedTo === "me" && actor?.id) where.assignedToUserId = actor.id;
    else if (q.assignedTo && q.assignedTo !== "me") where.assignedToUserId = q.assignedTo;

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              phone: true,
            },
          },
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              fullName: true,
              phone: true,
            },
          },
          assignedTo: {
            select: { id: true, fullName: true, email: true },
          },
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { id: true, text: true, sentAt: true, direction: true },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        channel: c.channel,
        telegramChatId: c.telegramChatId,
        contactId: c.contactId,
        leadId: c.leadId,
        contact: c.contact
          ? {
              id: c.contact.id,
              firstName: c.contact.firstName,
              lastName: c.contact.lastName,
              middleName: c.contact.middleName,
              phone: c.contact.phone,
            }
          : null,
        lead: c.lead
          ? {
              id: c.lead.id,
              firstName: c.lead.firstName,
              lastName: c.lead.lastName,
              middleName: c.lead.middleName,
              fullName: c.lead.fullName,
              phone: c.lead.phone,
            }
          : null,
        assignedTo: c.assignedTo,
        status: c.status,
        lastMessageAt: c.lastMessageAt,
        lastMessage: c.messages[0]
          ? {
              id: c.messages[0].id,
              text: c.messages[0].text,
              sentAt: c.messages[0].sentAt,
              direction: c.messages[0].direction,
            }
          : null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getMessages(conversationId: string, q: ListMessagesQueryDto, actor: AuthUser | undefined) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException("Conversation not found");

    const { page, pageSize, offset, limit } = normalizePagination(
      { page: q.page ?? 1, pageSize: q.pageSize ?? 50 },
      { page: 1, pageSize: 50 },
    );

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { sentAt: "asc" },
        skip: offset,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return {
      items: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.direction,
        text: m.text,
        tgMessageId: m.tgMessageId,
        authorUserId: m.authorUserId,
        author: m.author,
        sentAt: m.sentAt,
        createdAt: m.createdAt,
        mediaType: m.mediaType,
        fileId: m.fileId,
        fileUrl: m.fileUrl,
      })),
      total,
      page,
      pageSize,
    };
  }

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
    _actor: AuthUser | undefined,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException("Conversation not found");

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, fullName: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    });
  }

  async sendMessage(conversationId: string, text: string, actor: AuthUser | undefined) {
    if (!actor) throw new ForbiddenException("Authentication required");

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, telegramChatId: true },
    });
    if (!conv) throw new NotFoundException("Conversation not found");

    const sentAt = new Date();
    const { messageId } = await this.telegramService.sendMessageToChat(conv.telegramChatId, text);

    const message = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.OUTBOUND,
        text,
        tgMessageId: String(messageId),
        authorUserId: actor.id,
        sentAt,
      },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: sentAt },
    });

    return message;
  }

  async linkContact(conversationId: string, contactId: string, actor: AuthUser | undefined) {
    if (!actor) throw new ForbiddenException("Authentication required");

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, telegramChatId: true, leadId: true },
    });
    if (!conv) throw new NotFoundException("Conversation not found");

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { contactId, leadId: null },
      }),
      this.prisma.telegramAccount.updateMany({
        where: { telegramChatId: conv.telegramChatId },
        data: { contactId, leadId: null },
      }),
      ...(conv.leadId
        ? [
            this.prisma.lead.update({
              where: { id: conv.leadId },
              data: { contactId },
            }),
            this.prisma.telegramAccount.updateMany({
              where: { leadId: conv.leadId },
              data: { contactId, leadId: null },
            }),
            this.prisma.conversation.updateMany({
              where: { leadId: conv.leadId },
              data: { contactId, leadId: null },
            }),
          ]
        : []),
    ]);

    return { ok: true, contactId };
  }

  async createContactFromLead(conversationId: string, actor: AuthUser | undefined) {
    if (!actor) throw new ForbiddenException("Authentication required");

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    if (!conv.leadId || !conv.lead) {
      throw new BadRequestException("Conversation has no lead to create contact from");
    }

    const lead = conv.lead;
    const firstName = lead.firstName?.trim() || "Telegram";
    const lastName = lead.lastName?.trim() || lead.fullName?.trim() || "User";
    const middleName = lead.middleName?.trim() || null;
    const phone = lead.phone?.trim();
    if (!phone || phone.length < 5) {
      throw new BadRequestException(
        "Lead has no phone or phone too short. Add phone to lead first.",
      );
    }

    const contact = await this.contactsService.create(
      {
        companyId: lead.companyId ?? null,
        firstName,
        lastName,
        middleName,
        phone,
        email: lead.email ?? null,
      },
      actor,
    );

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { contactId: contact.id, leadId: null },
      }),
      this.prisma.telegramAccount.updateMany({
        where: { telegramChatId: conv.telegramChatId },
        data: { contactId: contact.id, leadId: null },
      }),
      this.prisma.telegramAccount.updateMany({
        where: { leadId: lead.id },
        data: { contactId: contact.id, leadId: null },
      }),
      this.prisma.lead.update({
        where: { id: lead.id },
        data: { contactId: contact.id },
      }),
      this.prisma.conversation.updateMany({
        where: { leadId: lead.id },
        data: { contactId: contact.id, leadId: null },
      }),
    ]);

    return { contact };
  }

  async suggestReplies(conversationId: string, actor: AuthUser | undefined) {
    if (!actor) throw new ForbiddenException("Authentication required");
    const suggestions = await this.telegramAiService.suggestReplies(conversationId);
    return { suggestions };
  }
}
