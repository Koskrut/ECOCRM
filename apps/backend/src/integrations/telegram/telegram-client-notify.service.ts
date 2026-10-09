import { Inject, Injectable, Logger, OnModuleInit, forwardRef } from "@nestjs/common";
import { ConversationChannel, MessageDirection, OrderStage, Prisma } from "@prisma/client";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { StoreCheckoutPaymentLinkService } from "../../store/checkout/store-checkout-payment-link.service";
import { signJwt } from "../../auth/jwt";
import {
  CLIENT_PUSH_STAGES,
  CLIENT_MENU_KEYBOARD,
  humanOrderStage,
} from "./telegram-client.constants";
import { TelegramService } from "./telegram.service";

@Injectable()
export class TelegramClientNotifyService implements OnModuleInit {
  private readonly logger = new Logger(TelegramClientNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly ports: IntegrationPortsService,
    private readonly paymentLinks: StoreCheckoutPaymentLinkService,
    @Inject(forwardRef(() => TelegramService)) private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    this.ports.registerClientOrderNotify(this);
  }

  async notifyOrderStageChanged(params: {
    orderId: string;
    fromStage: OrderStage | null;
    toStage: OrderStage;
  }): Promise<void> {
    if (!CLIENT_PUSH_STAGES.has(params.toStage)) return;
    if (params.fromStage === params.toStage) return;

    const order = await this.loadOrder(params.orderId);
    if (!order) return;
    const chatId = await this.resolveChatId(order.clientId, order.contactId);
    if (!chatId) return;

    const fingerprint = `stage:${params.toStage}`;
    if (!(await this.claimDedup(params.orderId, "stage", fingerprint))) return;

    const stageLabel = humanOrderStage(params.toStage, null);
    let text = `Замовлення №${order.orderNumber}: ${stageLabel}`;

    if (
      (params.toStage === OrderStage.AWAITING_PAYMENT || params.toStage === OrderStage.CONFIRMED) &&
      Number(order.debtAmount) > 0.00001
    ) {
      const payUrl = await this.tryPayUrl(order.id, order.clientId ?? order.contactId);
      if (payUrl) {
        text += `\nДо сплати: ${Number(order.debtAmount).toFixed(2)} ${order.currency ?? "USD"}`;
        text += `\nОплата: ${payUrl}`;
      } else {
        text += `\nДо сплати: ${Number(order.debtAmount).toFixed(2)} ${order.currency ?? "USD"}`;
      }
    }

    if (params.toStage === OrderStage.SHIPPED) {
      const ttn = order.ttns[0];
      if (ttn?.documentNumber) {
        text += `\nТТН: ${ttn.documentNumber}`;
      }
      if (ttn?.statusText) {
        text += `\nСтатус НП: ${ttn.statusText}`;
      }
    }

    const ok = await this.sendAndRecord(chatId, text);
    if (!ok) {
      await this.releaseDedup(params.orderId, "stage", fingerprint);
    }
  }

  async notifyTtnStatusChanged(params: {
    orderId: string;
    documentNumber: string | null;
    statusText: string | null;
    estimatedDeliveryDate: Date | null;
  }): Promise<void> {
    const status = (params.statusText ?? "").trim();
    if (!status && !params.documentNumber) return;

    const order = await this.loadOrder(params.orderId);
    if (!order) return;
    const chatId = await this.resolveChatId(order.clientId, order.contactId);
    if (!chatId) return;

    const fingerprint = `ttn:${params.documentNumber ?? ""}:${status}`;
    if (!(await this.claimDedup(params.orderId, "ttn", fingerprint))) return;

    const lines = [`Замовлення №${order.orderNumber}: оновлення доставки`];
    if (params.documentNumber) lines.push(`ТТН: ${params.documentNumber}`);
    if (status) lines.push(`Статус НП: ${status}`);
    if (params.estimatedDeliveryDate) {
      lines.push(
        `Орієнтовна дата: ${params.estimatedDeliveryDate.toLocaleDateString("uk-UA")}`,
      );
    }
    const ok = await this.sendAndRecord(chatId, lines.join("\n"));
    if (!ok) {
      await this.releaseDedup(params.orderId, "ttn", fingerprint);
    }
  }

  private async claimDedup(orderId: string, kind: string, fingerprint: string): Promise<boolean> {
    try {
      await this.prisma.telegramClientNotifyLog.create({
        data: { orderId, kind, fingerprint },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  private async releaseDedup(orderId: string, kind: string, fingerprint: string): Promise<void> {
    await this.prisma.telegramClientNotifyLog
      .deleteMany({ where: { orderId, kind, fingerprint } })
      .catch(() => {});
  }

  private async loadOrder(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        clientId: true,
        contactId: true,
        debtAmount: true,
        currency: true,
        ttns: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { documentNumber: true, statusText: true },
        },
      },
    });
  }

  private async resolveChatId(
    clientId: string | null,
    contactId: string | null,
  ): Promise<string | null> {
    const ids = [clientId, contactId].filter(Boolean) as string[];
    if (ids.length === 0) return null;
    const account = await this.prisma.telegramAccount.findFirst({
      where: { contactId: { in: ids } },
      orderBy: { lastMessageAt: "desc" },
      select: { telegramChatId: true },
    });
    return account?.telegramChatId ?? null;
  }

  private async tryPayUrl(orderId: string, contactId: string | null): Promise<string | null> {
    if (!contactId) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    try {
      const orderPayToken = signJwt(
        { typ: "store_order_pay", orderId, contactId },
        secret,
        { expiresInSeconds: 60 * 60 * 24 * 14 },
      );
      const { payPath } = await this.paymentLinks.createPaymentLink(orderPayToken);
      const store = await this.settings.getStoreConfig();
      const base = (store.crmPayPageUrl ?? "").trim().replace(/\/+$/, "");
      if (!base) return null;
      const path = payPath.startsWith("/") ? payPath : `/${payPath}`;
      return `${base}${path}`;
    } catch (err) {
      this.logger.debug(
        `pay url for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** @returns false when Telegram send failed (caller should release dedup). */
  private async sendAndRecord(chatId: string, text: string): Promise<boolean> {
    try {
      const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
        menuKeyboard: CLIENT_MENU_KEYBOARD,
      });
      const conversation = await this.prisma.conversation.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true },
      });
      if (conversation) {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: MessageDirection.OUTBOUND,
            text,
            tgMessageId: String(messageId),
            sentAt: new Date(),
            authorUserId: null,
          },
        });
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            channel: ConversationChannel.TELEGRAM,
          },
        });
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `client notify failed chat=${chatId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
