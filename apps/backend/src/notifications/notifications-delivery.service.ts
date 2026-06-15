import { Injectable, Logger } from "@nestjs/common";
import type { UserNotification } from "@prisma/client";
import { TelegramService } from "../integrations/telegram/telegram.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsDeliveryService {
  private readonly logger = new Logger(NotificationsDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async afterCreate(notification: UserNotification): Promise<void> {
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
}
