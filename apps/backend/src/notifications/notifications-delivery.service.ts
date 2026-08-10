import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import type { UserNotification } from "@prisma/client";
import { TelegramService } from "../integrations/telegram/telegram.service";
import { PrismaService } from "../prisma/prisma.service";
import { ExpoPushService } from "./expo-push.service";

const MOBILE_PUSH_CHANNEL_ID = "crm-alerts-v2";

@Injectable()
export class NotificationsDeliveryService {
  private readonly logger = new Logger(NotificationsDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
    @Inject(forwardRef(() => TelegramService)) private readonly telegram: TelegramService,
  ) {}

  async afterCreate(notification: UserNotification): Promise<void> {
    await Promise.allSettled([
      this.deliverTelegram(notification),
      this.deliverMobilePush(notification),
    ]);
  }

  private async deliverTelegram(notification: UserNotification): Promise<void> {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: {
        userId_type: { userId: notification.userId, type: notification.type },
      },
    });
    if (!pref?.telegram) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: notification.userId },
      select: { telegramChatId: true, fullName: true },
    });
    if (!user?.telegramChatId) {
      return;
    }

    const text = [notification.title, notification.body].filter(Boolean).join("\n");
    try {
      await this.telegram.sendMessageToChat(user.telegramChatId, text.slice(0, 4000));
    } catch (err) {
      this.logger.warn(
        `Telegram notification failed for user ${notification.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async deliverMobilePush(notification: UserNotification): Promise<void> {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: {
        userId_type: { userId: notification.userId, type: notification.type },
      },
    });
    if (!pref?.mobile) {
      const defaultMobile =
        notification.type === "FIELD_SHIFT_CLOSE_REMINDER" ||
        notification.type === "FIELD_GPS_STALE" ||
        notification.type === "PLANNING_FACTORY_DUE" ||
        notification.type === "PLANNING_PACKING_DUE";
      if (!defaultMobile) {
        return;
      }
    }

    const devices = await this.prisma.userPushDevice.findMany({
      where: { userId: notification.userId },
      select: { token: true },
    });
    if (devices.length === 0) {
      return;
    }

    const data: Record<string, string> = {
      notificationId: notification.id,
      type: notification.type,
    };
    if (notification.entityType) data.entityType = notification.entityType;
    if (notification.entityId) data.entityId = notification.entityId;

    const messages = devices.map((d) => ({
      to: d.token,
      title: notification.title,
      body: notification.body ?? undefined,
      data,
      sound: "default" as const,
      channelId: MOBILE_PUSH_CHANNEL_ID,
    }));

    const tickets = await this.expoPush.send(messages);
    const invalidTokens: string[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket && ExpoPushService.isInvalidTokenTicket(ticket)) {
        const token = devices[i]?.token;
        if (token) invalidTokens.push(token);
      }
    }
    if (invalidTokens.length > 0) {
      await this.prisma.userPushDevice.deleteMany({
        where: { token: { in: invalidTokens } },
      });
    }
  }
}
