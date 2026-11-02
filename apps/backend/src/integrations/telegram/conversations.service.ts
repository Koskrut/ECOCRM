import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ConversationChannel,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { normalizePagination } from "../../common/pagination";
import { ContactsService } from "../../contacts/contacts.service";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveAssignedManagerForRegion } from "../../settings/org-chart-region-resolver";
import { SettingsService } from "../../settings/settings.service";
import { TelegramAiService } from "./telegram-ai.service";
import { TelegramService } from "./telegram.service";
import {
  conversationListOrderBy,
  countUnreadInbound,
  hideNoiseWhere,
} from "../shared/conversation-inbox.util";
import { formatTelegramConversationLabel } from "./telegram-conversation-label.util";
import type { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import type { ListMessagesQueryDto } from "./dto/list-messages-query.dto";

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    private readonly telegramAiService: TelegramAiService,
    private readonly contactsService: ContactsService,
    private readonly settings: SettingsService,
  ) {}

  private requireActor(actor: AuthUser | undefined): AuthUser {
    if (!actor) throw new ForbiddenException("Authentication required");
    return actor;
  }

  /**
   * Managers: chats assigned to them, chats where they collaborate, + unassigned.
   * Admin/Lead see everything.
   */
  private buildVisibilityWhere(actor: AuthUser): Prisma.ConversationWhereInput {
    if (actor.role !== UserRole.MANAGER) return {};
    return {
      OR: [
        { assignedToUserId: actor.id },
        { assignedToUserId: null },
        { collaborators: { some: { userId: actor.id } } },
      ],
    };
  }

  private assertManagerCanAccessConversation(
    actor: AuthUser,
    conversation: {
      assignedToUserId: string | null;
      collaborators?: Array<{ userId: string }>;
    },
  ) {
    if (actor.role !== UserRole.MANAGER) return;
    if (!conversation.assignedToUserId) return;
    if (conversation.assignedToUserId === actor.id) return;
    if (conversation.collaborators?.some((c) => c.userId === actor.id)) return;
    throw new ForbiddenException("You cannot access a conversation assigned to another manager");
  }

  private collaboratorAccessSelect(actor: AuthUser) {
    return {
      assignedToUserId: true as const,
      collaborators: {
        where: { userId: actor.id },
        select: { userId: true },
        take: 1,
      },
    };
  }

  async list(q: ListConversationsQueryDto, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const { page, pageSize, offset, limit } = normalizePagination(
      { page: q.page ?? 1, pageSize: q.pageSize ?? 20 },
      { page: 1, pageSize: 20 },
    );

    const staffChatIds = await this.listStaffTelegramChatIds();
    const where: Prisma.ConversationWhereInput = {
      ...this.buildVisibilityWhere(safeActor),
    };
    if (q.channel) where.channel = q.channel;
    if (q.status) where.status = q.status;
    if (q.assignedTo === "me" && safeActor.id) where.assignedToUserId = safeActor.id;
    else if (q.assignedTo && q.assignedTo !== "me") where.assignedToUserId = q.assignedTo;
    const andParts: Prisma.ConversationWhereInput[] = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
    ];
    // Linked CRM staff chats are not client inbox threads.
    if (staffChatIds.length > 0) {
      andParts.push({
        OR: [{ telegramChatId: null }, { telegramChatId: { notIn: staffChatIds } }],
      });
    }
    if (q.hideNoise) andParts.push(hideNoiseWhere());
    if (andParts.length > 0) where.AND = andParts;

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: conversationListOrderBy,
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
              documentDisplayName: true,
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
          collaborators: {
            select: {
              userId: true,
              user: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
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

    const unreadById = await this.loadUnreadCounts(
      items.map((c) => ({ id: c.id, lastReadAt: c.lastReadAt })),
    );
    const peerByChatId = await this.loadTelegramPeers(
      items.map((c) => c.telegramChatId).filter(Boolean) as string[],
    );

    return {
      items: items.map((c) => {
        const peer = c.telegramChatId ? peerByChatId.get(c.telegramChatId) ?? null : null;
        const contact = c.contact
          ? {
              id: c.contact.id,
              firstName: c.contact.firstName,
              lastName: c.contact.lastName,
              middleName: c.contact.middleName,
              phone: c.contact.phone,
              documentDisplayName: c.contact.documentDisplayName,
            }
          : null;
        const lead = c.lead
          ? {
              id: c.lead.id,
              firstName: c.lead.firstName,
              lastName: c.lead.lastName,
              middleName: c.lead.middleName,
              fullName: c.lead.fullName,
              phone: c.lead.phone,
            }
          : null;
        return {
          id: c.id,
          channel: c.channel,
          telegramChatId: c.telegramChatId,
          contactId: c.contactId,
          leadId: c.leadId,
          contact,
          lead,
          telegramPeer: peer,
          displayName: formatTelegramConversationLabel({
            contact,
            lead,
            peer,
            telegramChatId: c.telegramChatId,
          }),
          assignedTo: c.assignedTo,
          collaborators: c.collaborators.map((row) => ({
            id: row.user.id,
            fullName: row.user.fullName,
            email: row.user.email,
          })),
          status: c.status,
          pinnedAt: c.pinnedAt,
          lastReadAt: c.lastReadAt,
          unreadCount: unreadById.get(c.id) ?? 0,
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
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  private async listStaffTelegramChatIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        telegramChatId: { not: null },
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { telegramChatId: true },
    });
    return rows
      .map((r) => r.telegramChatId)
      .filter((id): id is string => Boolean(id));
  }

  private async loadTelegramPeers(
    chatIds: string[],
  ): Promise<
    Map<string, { firstName: string | null; lastName: string | null; username: string | null }>
  > {
    const map = new Map<
      string,
      { firstName: string | null; lastName: string | null; username: string | null }
    >();
    if (chatIds.length === 0) return map;
    const rows = await this.prisma.telegramAccount.findMany({
      where: { telegramChatId: { in: [...new Set(chatIds)] } },
      select: {
        telegramChatId: true,
        firstName: true,
        lastName: true,
        username: true,
      },
    });
    for (const row of rows) {
      map.set(row.telegramChatId, {
        firstName: row.firstName,
        lastName: row.lastName,
        username: row.username,
      });
    }
    return map;
  }

  private async loadUnreadCounts(
    rows: Array<{ id: string; lastReadAt: Date | null }>,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (rows.length === 0) return result;

    const ids = rows.map((r) => r.id);
    const inbound = await this.prisma.message.findMany({
      where: {
        conversationId: { in: ids },
        direction: MessageDirection.INBOUND,
      },
      select: { conversationId: true, sentAt: true, direction: true },
    });

    const lastReadById = new Map(rows.map((r) => [r.id, r.lastReadAt]));
    for (const id of ids) result.set(id, 0);
    for (const msg of inbound) {
      const lastReadAt = lastReadById.get(msg.conversationId) ?? null;
      const n = countUnreadInbound([msg], lastReadAt);
      if (n > 0) result.set(msg.conversationId, (result.get(msg.conversationId) ?? 0) + n);
    }
    return result;
  }

  /**
   * Conversations with at least one unread inbound message (after lastReadAt).
   */
  async unreadCount(actor: AuthUser | undefined): Promise<{ count: number }> {
    const safeActor = this.requireActor(actor);
    const where: Prisma.ConversationWhereInput = {
      ...this.buildVisibilityWhere(safeActor),
      status: ConversationStatus.OPEN,
      channel: ConversationChannel.TELEGRAM,
    };

    const rows = await this.prisma.conversation.findMany({
      where,
      select: {
        id: true,
        lastReadAt: true,
        messages: {
          where: { direction: MessageDirection.INBOUND },
          select: { direction: true, sentAt: true },
        },
      },
    });

    const count = rows.filter((row) => countUnreadInbound(row.messages, row.lastReadAt) > 0).length;
    return { count };
  }

  async getMessages(conversationId: string, q: ListMessagesQueryDto, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    const { page, pageSize, limit } = normalizePagination(
      { page: q.page ?? 1, pageSize: q.pageSize ?? 50 },
      { page: 1, pageSize: 50 },
    );

    // Inbox chat needs the *newest* window. Page 1 = latest N (chronological asc for UI);
    // page 2+ walks further back. Old "page 1 = oldest" hid CRM replies after poll in long threads.
    const total = await this.prisma.message.count({ where: { conversationId } });
    const skip = Math.max(0, total - page * limit);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: "asc" },
      skip,
      take: limit,
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    const items = messages.map((m) => {
      let fileUrl = m.fileUrl;
      // Never return a Bot API URL: it embeds the bot token.
      if (fileUrl && (fileUrl.includes("/file/bot") || fileUrl.includes("api.telegram.org/file/bot"))) {
        fileUrl = null;
      }
      return {
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
          fileUrl,
          status: m.status,
        };
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async getMessageFile(
    conversationId: string,
    messageId: string,
    actor: AuthUser | undefined,
  ): Promise<{ contentType: string; body: Buffer }> {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { fileId: true },
    });
    if (!message?.fileId) throw new NotFoundException("File not found");
    return this.telegramService.downloadFile(message.fileId);
  }

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
    actor: AuthUser | undefined,
  ) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

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

  async setPinned(conversationId: string, pinned: boolean, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { pinnedAt: pinned ? new Date() : null },
      select: {
        id: true,
        pinnedAt: true,
        status: true,
        lastMessageAt: true,
      },
    });
  }

  async markRead(conversationId: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    const lastReadAt = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastReadAt },
    });
    return { ok: true, lastReadAt };
  }

  async addInternalNote(conversationId: string, text: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const normalizedText = String(text ?? "").trim();
    if (!normalizedText) {
      throw new BadRequestException("Note text cannot be empty");
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    const sentAt = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.INTERNAL,
        text: normalizedText,
        authorUserId: safeActor.id,
        sentAt,
        status: MessageStatus.SENT,
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

  /**
   * Assign an unassigned conversation to the regional manager from CRM contact/lead
   * ownership or org-chart region mapping. No-op when already assigned or no match.
   */
  async autoAssignByRegion(conversationId: string): Promise<string | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        contactId: true,
        leadId: true,
        contact: { select: { id: true, ownerId: true, region: true } },
        lead: { select: { id: true, ownerId: true, region: true } },
      },
    });
    if (!conv) return null;
    if (conv.assignedToUserId) return conv.assignedToUserId;

    let managerId =
      (await this.activeStaffUserId(conv.contact?.ownerId)) ??
      (await this.activeStaffUserId(conv.lead?.ownerId));

    if (!managerId) {
      const region =
        String(conv.contact?.region ?? "").trim() ||
        String(conv.lead?.region ?? "").trim();
      if (region) {
        try {
          const org = await this.settings.getOrgChartStructure();
          const resolved = resolveAssignedManagerForRegion(org, region)?.managerId ?? null;
          managerId = await this.activeStaffUserId(resolved);
        } catch {
          managerId = null;
        }
      }
    }

    if (!managerId) return null;

    await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { assignedToUserId: managerId },
    });

    if (conv.contactId && !conv.contact?.ownerId) {
      await this.prisma.contact
        .update({ where: { id: conv.contactId }, data: { ownerId: managerId } })
        .catch(() => {});
    }
    if (conv.leadId && !conv.lead?.ownerId) {
      await this.prisma.lead
        .update({ where: { id: conv.leadId }, data: { ownerId: managerId } })
        .catch(() => {});
    }

    return managerId;
  }

  private async activeStaffUserId(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async assign(conversationId: string, userId: string | null, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    // Collaborators may reply, but only the assignee (or Lead/Admin) may transfer/unassign.
    // Claiming from the unassigned pool is always allowed for managers.
    const isLeadOrAdmin =
      safeActor.role === UserRole.ADMIN || safeActor.role === UserRole.LEAD;
    const isAssignee = conv.assignedToUserId === safeActor.id;
    const isUnassigned = !conv.assignedToUserId;
    const claimingSelf = Boolean(userId && userId === safeActor.id && isUnassigned);
    if (
      safeActor.role === UserRole.MANAGER &&
      !isLeadOrAdmin &&
      !isAssignee &&
      !claimingSelf
    ) {
      throw new ForbiddenException(
        "Тільки відповідальний може передати або зняти призначення з чату",
      );
    }

    if (userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          isActive: true,
          role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
        },
        select: { id: true },
      });
      if (!user) throw new NotFoundException("User not found");
    }

    // Transfer: drop new assignee from collaborators if they were joint.
    // Unassign: clear all collaborators so the thread is a true open pool.
    if (userId) {
      await this.prisma.conversationCollaborator
        .deleteMany({ where: { conversationId, userId } })
        .catch(() => {});
    } else {
      await this.prisma.conversationCollaborator
        .deleteMany({ where: { conversationId } })
        .catch(() => {});
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedToUserId: userId },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, fullName: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        collaborators: {
          select: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    return {
      ...updated,
      collaborators: updated.collaborators.map((row) => ({
        id: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
      })),
    };
  }

  /** Invite another manager to work the thread jointly (keeps primary assignee). */
  async addCollaborator(
    conversationId: string,
    userId: string,
    actor: AuthUser | undefined,
  ) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    // Collaborators may reply; only assignee / Lead / Admin may invite more people.
    const isLeadOrAdmin =
      safeActor.role === UserRole.ADMIN || safeActor.role === UserRole.LEAD;
    if (
      safeActor.role === UserRole.MANAGER &&
      !isLeadOrAdmin &&
      conv.assignedToUserId !== safeActor.id
    ) {
      throw new ForbiddenException(
        "Тільки відповідальний може додати співавтора до чату",
      );
    }

    if (!userId || userId === conv.assignedToUserId) {
      throw new BadRequestException("Choose a manager who is not already the assignee");
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { id: true, fullName: true, email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    await this.prisma.conversationCollaborator.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, addedById: safeActor.id },
      update: {},
    });

    return this.listCollaborators(conversationId);
  }

  async removeCollaborator(
    conversationId: string,
    userId: string,
    actor: AuthUser | undefined,
  ) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);

    // Collaborator may leave themselves; otherwise assignee/admin removes.
    if (
      safeActor.role === UserRole.MANAGER &&
      userId !== safeActor.id &&
      conv.assignedToUserId !== safeActor.id
    ) {
      throw new ForbiddenException("Only the assignee can remove other collaborators");
    }

    await this.prisma.conversationCollaborator.deleteMany({
      where: { conversationId, userId },
    });
    return this.listCollaborators(conversationId);
  }

  private async listCollaborators(conversationId: string) {
    const rows = await this.prisma.conversationCollaborator.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
    return {
      collaborators: rows.map((r) => ({
        id: r.user.id,
        fullName: r.user.fullName,
        email: r.user.email,
      })),
    };
  }

  async sendMessage(conversationId: string, text: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const normalizedText = String(text ?? "").trim();
    if (!normalizedText) {
      throw new BadRequestException("Message text cannot be empty");
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        telegramChatId: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);
    if (!conv.telegramChatId) {
      throw new BadRequestException("Conversation has no Telegram chat");
    }

    const sentAt = new Date();

    // Outbox pattern: persist the outbound message as PENDING before calling the
    // Bot API, so a message that reaches Telegram is never missing from the CRM
    // even if a later DB write fails. On send failure we mark it FAILED.
    const pending = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.OUTBOUND,
        text: normalizedText,
        authorUserId: safeActor.id,
        sentAt,
        status: MessageStatus.PENDING,
      },
    });

    let messageId: number;
    try {
      ({ messageId } = await this.telegramService.sendMessageToChat(
        conv.telegramChatId,
        normalizedText,
      ));
    } catch (error) {
      await this.prisma.message
        .update({ where: { id: pending.id }, data: { status: MessageStatus.FAILED } })
        .catch(() => {});
      throw error;
    }

    const message = await this.prisma.message.update({
      where: { id: pending.id },
      data: { tgMessageId: String(messageId), status: MessageStatus.SENT },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: sentAt, lastReadAt: sentAt },
    });

    return message;
  }

  async linkContact(conversationId: string, contactId: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        telegramChatId: true,
        leadId: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);
    if (!conv.telegramChatId) {
      throw new BadRequestException("Conversation has no Telegram chat");
    }

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

    await this.autoAssignByRegion(conversationId);
    return { ok: true, contactId };
  }

  async createContactFromLead(conversationId: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);
    if (!conv.telegramChatId) {
      throw new BadRequestException("Conversation has no Telegram chat");
    }
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
      safeActor,
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

    await this.autoAssignByRegion(conversationId);
    return { contact };
  }

  async suggestReplies(conversationId: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        assignedToUserId: true,
        collaborators: {
          where: { userId: safeActor.id },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertManagerCanAccessConversation(safeActor, conv);
    const suggestions = await this.telegramAiService.suggestReplies(conversationId);
    return { suggestions };
  }
}
