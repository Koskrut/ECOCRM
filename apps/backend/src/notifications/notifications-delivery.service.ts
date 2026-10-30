import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import type { UserNotification } from "@prisma/client";
import { TelegramService } from "../integrations/telegram/telegram.service";
import type { TelegramInlineButton } from "../integrations/telegram/telegram.types";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { ExpoPushService } from "./expo-push.service";
import { defaultChannelsForType } from "./notification-type-defaults";

const MOBILE_PUSH_CHANNEL_ID = "crm-alerts-v2";

@Injectable()
export class NotificationsDeliveryService {
  private readonly logger = new Logger(NotificationsDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
    private readonly settings: SettingsService,
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
    const telegramEnabled = pref
      ? pref.telegram
      : defaultChannelsForType(notification.type).telegram;
    if (!telegramEnabled) {
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
    const inlineKeyboard = await this.buildManagerKeyboard(notification);
    try {
      await this.telegram.sendMessageToChat(user.telegramChatId, text.slice(0, 4000), {
        ...(inlineKeyboard?.length ? { inlineKeyboard } : {}),
      });
    } catch (err) {
      this.logger.warn(
        `Telegram notification failed for user ${notification.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async buildManagerKeyboard(
    notification: UserNotification,
  ): Promise<TelegramInlineButton[][] | null> {
    if (notification.type === "TELEGRAM_MESSAGE" && notification.entityId) {
      const convId = notification.entityId;
      if (Buffer.byteLength(`mgr:claim:${convId}`) > 64) return null;
      const row: TelegramInlineButton[] = [
        { text: "✅ Взяти чат", callback_data: `mgr:claim:${convId}` },
        { text: "🔕 30 хв", callback_data: `mgr:mute:${convId}` },
      ];
      const url = await this.crmPathUrl(
        `/inbox?channel=TELEGRAM&conversationId=${encodeURIComponent(convId)}`,
      );
      const rows: TelegramInlineButton[][] = [row];
      if (url) {
        rows.push([{ text: "🔗 Відкрити в CRM", url }]);
      } else {
        rows.push([{ text: "🔗 Посилання", callback_data: `mgr:open:${convId}` }]);
      }
      return rows;
    }

    if (notification.type === "NEW_LEAD" && notification.entityId) {
      const url = await this.crmPathUrl(
        `/leads?leadId=${encodeURIComponent(notification.entityId)}`,
      );
      if (!url) return null;
      return [[{ text: "🔗 Відкрити лід", url }]];
    }

    if (notification.type === "CLIENT_ORDER_ACCEPTED" && notification.entityId) {
      const orderId = notification.entityId;
      if (Buffer.byteLength(`mgr:inv:${orderId}`) > 64) return null;
      const rows: TelegramInlineButton[][] = [
        [
          { text: "📄 Рахунок", callback_data: `mgr:inv:${orderId}` },
          { text: "📄 РН", callback_data: `mgr:way:${orderId}` },
        ],
      ];
      const url = await this.crmPathUrl(
        `/orders?orderId=${encodeURIComponent(orderId)}`,
      );
      if (url) rows.push([{ text: "🔗 Відкрити замовлення", url }]);
      return rows;
    }

    return null;
  }

  private async crmPathUrl(path: string): Promise<string | null> {
    const base = await this.resolveCrmWebBase();
    if (!base) return null;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalized}`;
  }

  private async resolveCrmWebBase(): Promise<string | null> {
    try {
      const store = await this.settings.getStoreConfig();
      const fromStore = (store.crmPayPageUrl ?? "").trim().replace(/\/+$/, "");
      if (/^https:\/\//i.test(fromStore)) return fromStore;
    } catch {
      /* ignore */
    }
    const fromEnv = (process.env.CRM_WEB_URL ?? process.env.WEB_ORIGIN ?? "")
      .trim()
      .replace(/\/+$/, "");
    return /^https:\/\//i.test(fromEnv) ? fromEnv : null;
  }

  private async deliverMobilePush(notification: UserNotification): Promise<void> {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: {
        userId_type: { userId: notification.userId, type: notification.type },
      },
    });
    // Explicit opt-out wins. Without a row, use type defaults (field/planning/sale push on).
    const mobileEnabled = pref ? pref.mobile : defaultChannelsForType(notification.type).mobile;
    if (!mobileEnabled) {
      return;
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
