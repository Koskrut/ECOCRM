import { BadRequestException, forwardRef, Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { TelegramService } from "../integrations/telegram/telegram.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrdersDocumentsService } from "./orders-documents.service";

export type OrderDocumentKind = "invoice" | "waybill";
export type OrderDocumentTelegramDest = "me" | "client";

export type OrderTelegramDocumentsStatus = {
  managerLinked: boolean;
  clientLinked: boolean;
};

@Injectable()
export class OrdersTelegramDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderDocuments: OrdersDocumentsService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
  ) {}

  async getStatus(orderId: string, actor?: AuthUser): Promise<OrderTelegramDocumentsStatus> {
    const order = await this.orderDocuments.getOrderForDocument(orderId, actor);
    const managerLinked = actor?.id
      ? Boolean(
          (
            await this.prisma.user.findUnique({
              where: { id: actor.id },
              select: { telegramChatId: true },
            })
          )?.telegramChatId,
        )
      : false;
    const clientLinked = Boolean(
      await this.resolveClientTelegramChatId(order.contactId, order.clientId),
    );
    return { managerLinked, clientLinked };
  }

  /**
   * Build PDF and send via Telegram to the manager ("me") or the linked client chat.
   * `overrides.managerChatId` / `clientChatId` let the manager bot target the current chat
   * or a session-selected client without re-resolving.
   */
  async sendDocument(
    orderId: string,
    kind: OrderDocumentKind,
    dest: OrderDocumentTelegramDest,
    actor: AuthUser,
    overrides?: { managerChatId?: string | null; clientChatId?: string | null },
  ): Promise<{ ok: true; dest: OrderDocumentTelegramDest; kind: OrderDocumentKind }> {
    const order = await this.orderDocuments.getOrderForDocument(orderId, actor);
    const pdf =
      kind === "invoice"
        ? await this.orderDocuments.buildInvoicePdfFromOrder(order)
        : await this.orderDocuments.buildWaybillPdfFromOrder(order);

    const label = kind === "invoice" ? "Рахунок" : "Видаткова накладна (РН)";
    const filename =
      kind === "invoice"
        ? `invoice-${order.orderNumber}.pdf`
        : `waybill-${order.orderNumber}.pdf`;
    const caption = `${label} · замовлення №${order.orderNumber}`;

    if (dest === "me") {
      const chatId =
        overrides?.managerChatId?.trim() ||
        (await this.resolveManagerTelegramChatId(actor.id));
      if (!chatId) {
        throw new BadRequestException(
          "Прив'яжіть Telegram у налаштуваннях профілю (Налаштування → Telegram → /link), щоб отримати документ.",
        );
      }
      await this.telegram.sendDocumentToChat(chatId, pdf, filename, { caption });
      return { ok: true, dest, kind };
    }

    const clientChatId =
      overrides?.clientChatId?.trim() ||
      (await this.resolveClientTelegramChatId(order.contactId, order.clientId));
    if (!clientChatId) {
      throw new BadRequestException(
        "У клієнта немає прив'язаного Telegram. Прив'яжіть чат у CRM або надішліть документ собі.",
      );
    }

    await this.telegram.sendDocumentToChat(clientChatId, pdf, filename, {
      caption: `${caption}\n\nДокумент від вашого менеджера SUPREX.`,
    });
    return { ok: true, dest, kind };
  }

  async resolveManagerTelegramChatId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    return user?.telegramChatId ?? null;
  }

  async resolveClientTelegramChatId(
    contactId: string | null | undefined,
    clientId: string | null | undefined,
  ): Promise<string | null> {
    const ids = [...new Set([contactId, clientId].filter(Boolean))] as string[];
    if (ids.length === 0) return null;

    const account = await this.prisma.telegramAccount.findFirst({
      where: { contactId: { in: ids } },
      select: { telegramChatId: true },
    });
    if (account?.telegramChatId) return account.telegramChatId;

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        contactId: { in: ids },
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true },
      orderBy: { lastMessageAt: "desc" },
    });
    return conversation?.telegramChatId ?? null;
  }
}
