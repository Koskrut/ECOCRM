import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import type { NotificationType, Prisma, UserNotification } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsDeliveryService } from "./notifications-delivery.service";

const DEFAULT_DEBOUNCE_MS = 3 * 60 * 1000;

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  actorId?: string | null;
};

export type QtyChangeMeta = {
  itemId: string;
  productName: string;
  prevQty: number;
  nextQty: number;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly delivery?: NotificationsDeliveryService,
  ) {}

  async create(params: CreateNotificationParams): Promise<UserNotification | null> {
    if (params.actorId && params.actorId === params.userId) {
      return null;
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, isActive: true },
    });
    if (!recipient?.isActive) {
      return null;
    }

    const inAppEnabled = await this.isChannelEnabled(params.userId, params.type, "inApp");
    const browserEnabled = await this.isChannelEnabled(params.userId, params.type, "browser");
    const telegramEnabled = await this.isChannelEnabled(params.userId, params.type, "telegram");
    const mobileEnabled = await this.isChannelEnabled(params.userId, params.type, "mobile");
    if (!inAppEnabled && !browserEnabled && !telegramEnabled && !mobileEnabled) {
      return null;
    }

    const row = await this.prisma.userNotification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        meta: params.meta ? (params.meta as Prisma.InputJsonValue) : undefined,
      },
    });

    void this.delivery?.afterCreate(row);
    return row;
  }

  /**
   * Merge qty changes into a single unread notification within debounce window.
   */
  async createDebouncedQtyChange(params: {
    userId: string;
    orderId: string;
    orderNumber: string;
    currency: string;
    actorId?: string | null;
    actorName?: string | null;
    change: QtyChangeMeta;
    prevTotalAmount: number;
    nextTotalAmount: number;
    debounceKey: string;
    windowMs?: number;
  }): Promise<UserNotification | null> {
    if (params.actorId && params.actorId === params.userId) {
      return null;
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, isActive: true },
    });
    if (!recipient?.isActive) {
      return null;
    }

    const inAppEnabled = await this.isChannelEnabled(params.userId, "ORDER_QTY_CHANGED", "inApp");
    const browserEnabled = await this.isChannelEnabled(params.userId, "ORDER_QTY_CHANGED", "browser");
    const telegramEnabled = await this.isChannelEnabled(params.userId, "ORDER_QTY_CHANGED", "telegram");
    const mobileEnabled = await this.isChannelEnabled(params.userId, "ORDER_QTY_CHANGED", "mobile");
    if (!inAppEnabled && !browserEnabled && !telegramEnabled && !mobileEnabled) {
      return null;
    }

    const windowMs = params.windowMs ?? DEFAULT_DEBOUNCE_MS;
    const since = new Date(Date.now() - windowMs);

    const existing = await this.prisma.userNotification.findFirst({
      where: {
        userId: params.userId,
        type: "ORDER_QTY_CHANGED",
        entityType: "ORDER",
        entityId: params.orderId,
        readAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    const metaObj = (existing?.meta ?? {}) as Record<string, unknown>;
    const debounceKey = metaObj.debounceKey;
    if (existing && debounceKey === params.debounceKey) {
      const changes = Array.isArray(metaObj.changes)
        ? ([...metaObj.changes] as QtyChangeMeta[])
        : [];
      const idx = changes.findIndex((c) => c.itemId === params.change.itemId);
      if (idx >= 0) {
        changes[idx] = params.change;
      } else {
        changes.push(params.change);
      }

      const title = `Замовлення №${params.orderNumber}: змінено кількість (${changes.length})`;
      const bodyLines = changes.map(
        (c) => `${c.productName}: ${c.prevQty}→${c.nextQty} шт.`,
      );
      const body = [
        ...bodyLines,
        `Сума: ${params.prevTotalAmount.toFixed(2)} → ${params.nextTotalAmount.toFixed(2)} ${params.currency}`,
        params.actorName ? `Кладовщик: ${params.actorName}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      return this.prisma.userNotification.update({
        where: { id: existing.id },
        data: {
          title,
          body,
          meta: {
            debounceKey: params.debounceKey,
            orderNumber: params.orderNumber,
            changes,
            prevTotalAmount: params.prevTotalAmount,
            nextTotalAmount: params.nextTotalAmount,
            actorName: params.actorName ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    }

    const title = `Замовлення №${params.orderNumber}: ${params.change.productName}`;
    const body = [
      `${params.change.prevQty}→${params.change.nextQty} шт.`,
      `Сума: ${params.prevTotalAmount.toFixed(2)} → ${params.nextTotalAmount.toFixed(2)} ${params.currency}`,
      params.actorName ? `Кладовщик: ${params.actorName}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return this.create({
      userId: params.userId,
      type: "ORDER_QTY_CHANGED",
      title,
      body,
      entityType: "ORDER",
      entityId: params.orderId,
      actorId: params.actorId,
      meta: {
        debounceKey: params.debounceKey,
        orderNumber: params.orderNumber,
        changes: [params.change],
        prevTotalAmount: params.prevTotalAmount,
        nextTotalAmount: params.nextTotalAmount,
        actorName: params.actorName ?? null,
      },
    }).then(async (created) => {
      if (created) {
        await this.maybeNotifyLeadCopy({
          userId: params.userId,
          type: "ORDER_QTY_CHANGED",
          title,
          body,
          entityType: "ORDER",
          entityId: params.orderId,
          actorId: params.actorId,
          meta: {
            debounceKey: params.debounceKey,
            orderNumber: params.orderNumber,
            teamCopySourceId: created.id,
          },
        });
      }
      return created;
    });
  }

  async notifyWithTeamCopy(params: CreateNotificationParams): Promise<UserNotification | null> {
    const primary = await this.create(params);
    await this.maybeNotifyLeadCopy(params);
    return primary;
  }

  private async maybeNotifyLeadCopy(params: CreateNotificationParams): Promise<void> {
    const owner = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        leadId: true,
        lead: { select: { id: true, teamNotificationsEnabled: true, isActive: true } },
      },
    });
    const lead = owner?.lead;
    if (!lead?.isActive || !lead.teamNotificationsEnabled) {
      return;
    }
    if (params.actorId && params.actorId === lead.id) {
      return;
    }

    await this.create({
      ...params,
      userId: lead.id,
      title: `[Команда] ${params.title}`,
      meta: {
        ...(params.meta ?? {}),
        teamCopyForUserId: params.userId,
      },
    });
  }

  async list(
    userId: string,
    opts?: { page?: number; pageSize?: number; unreadOnly?: boolean },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize ?? 20));
    const where: Prisma.UserNotificationWhereInput = {
      userId,
      ...(opts?.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userNotification.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.userNotification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, id: string): Promise<UserNotification> {
    const row = await this.prisma.userNotification.findFirst({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException("Notification not found");
    }
    if (row.readAt) {
      return row;
    }
    return this.prisma.userNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async getPreferences(userId: string) {
    const rows = await this.prisma.userNotificationPreference.findMany({
      where: { userId },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { teamNotificationsEnabled: true },
    });
    return {
      teamNotificationsEnabled: user?.teamNotificationsEnabled ?? false,
      types: rows,
    };
  }

  async updatePreferences(
    userId: string,
    body: {
      teamNotificationsEnabled?: boolean;
      types?: Array<{
        type: NotificationType;
        inApp?: boolean;
        browser?: boolean;
        telegram?: boolean;
        mobile?: boolean;
      }>;
    },
  ) {
    if (body.teamNotificationsEnabled !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { teamNotificationsEnabled: body.teamNotificationsEnabled },
      });
    }

    if (body.types?.length) {
      for (const row of body.types) {
        await this.prisma.userNotificationPreference.upsert({
          where: { userId_type: { userId, type: row.type } },
          create: {
            userId,
            type: row.type,
            inApp: row.inApp ?? true,
            browser: row.browser ?? false,
            telegram: row.telegram ?? false,
            mobile: row.mobile ?? false,
          },
          update: {
            ...(row.inApp !== undefined ? { inApp: row.inApp } : {}),
            ...(row.browser !== undefined ? { browser: row.browser } : {}),
            ...(row.telegram !== undefined ? { telegram: row.telegram } : {}),
            ...(row.mobile !== undefined ? { mobile: row.mobile } : {}),
          },
        });
      }
    }

    return this.getPreferences(userId);
  }

  private async isChannelEnabled(
    userId: string,
    type: NotificationType,
    channel: "inApp" | "browser" | "telegram" | "mobile",
  ): Promise<boolean> {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    if (!pref) {
      if (channel === "inApp") return true;
      if (channel === "mobile" && type === "FIELD_SHIFT_CLOSE_REMINDER") return true;
      if (channel === "mobile" && type === "FIELD_GPS_STALE") return true;
      return false;
    }
    return pref[channel];
  }

  async deliverExternalChannels(notification: UserNotification): Promise<void> {
    await this.delivery?.afterCreate(notification);
  }

  async registerPushDevice(
    userId: string,
    body: { token: string; platform: string; deviceId?: string | null },
  ) {
    const token = body.token.trim();
    if (!token.startsWith("ExponentPushToken[") || !token.endsWith("]")) {
      throw new BadRequestException("Invalid Expo push token");
    }
    const platform = body.platform.trim().toLowerCase();
    if (!platform) {
      throw new BadRequestException("platform is required");
    }

    return this.prisma.userPushDevice.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        deviceId: body.deviceId?.trim() || null,
      },
      update: {
        userId,
        platform,
        deviceId: body.deviceId?.trim() || null,
        lastSeenAt: new Date(),
      },
    });
  }

  async unregisterPushDevice(userId: string, token: string): Promise<{ deleted: boolean }> {
    const normalized = decodeURIComponent(token).trim();
    const result = await this.prisma.userPushDevice.deleteMany({
      where: { userId, token: normalized },
    });
    return { deleted: result.count > 0 };
  }

  async notifyTaskAssigned(params: {
    assigneeId: string;
    taskId: string;
    title: string;
    body?: string | null;
    actorId?: string | null;
    orderId?: string | null;
    leadId?: string | null;
  }): Promise<void> {
    await this.create({
      userId: params.assigneeId,
      type: "TASK_ASSIGNED",
      title: params.title,
      body: params.body,
      entityType: "TASK",
      entityId: params.taskId,
      actorId: params.actorId,
      meta: {
        orderId: params.orderId ?? null,
        leadId: params.leadId ?? null,
      },
    });
  }

  async notifyNewLead(params: {
    ownerId: string;
    leadId: string;
    title: string;
    body?: string | null;
    actorId?: string | null;
  }): Promise<void> {
    await this.notifyWithTeamCopy({
      userId: params.ownerId,
      type: "NEW_LEAD",
      title: params.title,
      body: params.body,
      entityType: "LEAD",
      entityId: params.leadId,
      actorId: params.actorId,
    });
  }

  async notifyMissedCall(params: {
    managerUserId: string;
    customerPhone: string | null;
    contactId?: string | null;
    leadId?: string | null;
    companyId?: string | null;
  }): Promise<void> {
    const body = params.customerPhone ? `Телефон: ${params.customerPhone}` : undefined;
    await this.create({
      userId: params.managerUserId,
      type: "MISSED_CALL",
      title: "Пропущений дзвінок",
      body,
      entityType: params.leadId ? "LEAD" : params.contactId ? "CONTACT" : null,
      entityId: params.leadId ?? params.contactId ?? null,
      meta: {
        customerPhone: params.customerPhone,
        companyId: params.companyId ?? null,
      },
    });
  }

  async notifyFieldShiftCloseReminder(params: {
    userId: string;
    shiftId: string;
    dateYmd: string;
  }): Promise<void> {
    await this.create({
      userId: params.userId,
      type: "FIELD_SHIFT_CLOSE_REMINDER",
      title: "Закрийте зміну",
      body: "Зміна все ще відкрита. Завершіть зміну в CRM, щоб GPS-маршрут зафіксувався правильно.",
      entityType: "FIELD_SHIFT",
      entityId: params.shiftId,
      meta: { dateYmd: params.dateYmd },
    });
  }

  async notifyFieldGpsStale(params: {
    userId: string;
    shiftId: string;
    dateYmd: string;
    lastSampleAt: string;
  }): Promise<void> {
    await this.create({
      userId: params.userId,
      type: "FIELD_GPS_STALE",
      title: "GPS зупинився",
      body: "Відкрийте CRM — GPS зупинився",
      entityType: "FIELD_SHIFT",
      entityId: params.shiftId,
      meta: { dateYmd: params.dateYmd, lastSampleAt: params.lastSampleAt },
    });
  }
}
