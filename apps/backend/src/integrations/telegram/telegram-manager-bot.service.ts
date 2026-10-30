import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import {
  getPhoneCandidatesForLookup,
  getPhoneNormalizedDigits,
} from "../../common/phone.utils";
import { OrdersTelegramDocumentsService } from "../../orders/orders-telegram-documents.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import {
  TelegramBotSessionService,
  type BotSessionPayload,
} from "./telegram-bot-session.service";
import { ConversationsService } from "./conversations.service";
import { TelegramInboxNotifierService } from "./telegram-inbox-notifier.service";
import { TelegramService } from "./telegram.service";
import type { ParsedInbound, TelegramInlineButton } from "./telegram.types";

const CONTACT_HIT_LIMIT = 8;
const ORDER_HIT_LIMIT = 10;

/**
 * Lightweight staff actions on the shared client bot.
 * Callbacks use the `mgr:` namespace and never enter the shop FSM.
 */
@Injectable()
export class TelegramManagerBotService {
  private readonly logger = new Logger(TelegramManagerBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sessions: TelegramBotSessionService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations: ConversationsService,
    private readonly inboxNotifier: TelegramInboxNotifierService,
    private readonly orderTelegramDocuments: OrdersTelegramDocumentsService,
    @Inject(forwardRef(() => TelegramService)) private readonly telegram: TelegramService,
  ) {}

  isManagerCallback(data: string | null | undefined): boolean {
    return Boolean(data?.startsWith("mgr:"));
  }

  isDocsCommand(text: string | null | undefined): boolean {
    const t = text?.trim() ?? "";
    return /^\/docs(?:@\w+)?(?:\s|$)/i.test(t);
  }

  isClientCommand(text: string | null | undefined): boolean {
    const t = text?.trim() ?? "";
    return /^\/(?:client|find)(?:@\w+)?(?:\s|$)/i.test(t);
  }

  /**
   * Staff text before the client shop pipeline: /client, /docs, mgr_search query, /cancel in mgr flow.
   */
  async tryHandleStaffText(parsed: ParsedInbound): Promise<boolean> {
    if (parsed.isCallback) return false;
    const text = parsed.text?.trim() ?? "";
    if (!text) return false;

    const wantsStaffCmd = this.isDocsCommand(text) || this.isClientCommand(text);
    const user = await this.findStaffUser(parsed.userId);

    if (wantsStaffCmd && !user) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Команди /client і /docs для менеджерів CRM. Прив'яжіть акаунт: Налаштування → Telegram → /link.",
      );
      return true;
    }

    if (!user) return false;

    const lower = text.toLowerCase();
    if (lower === "/cancel") {
      const session = await this.sessions.get(parsed.userId);
      if (session.state === "mgr_search" || session.payload.mgrContactId || session.payload.mgrOrderId) {
        await this.sessions.resetIdle(parsed.userId);
        await this.telegram.sendMessageToChat(parsed.chatId, "Скасовано.");
        return true;
      }
      return false;
    }

    if (this.isClientCommand(text)) {
      await this.startClientSearch(parsed, user);
      return true;
    }

    if (this.isDocsCommand(text)) {
      await this.handleDocsCommand(parsed, user);
      return true;
    }

    const session = await this.sessions.get(parsed.userId);
    if (session.state === "mgr_search") {
      await this.runClientSearch(parsed, user, text);
      return true;
    }

    return false;
  }

  async handleDocsCommand(parsed: ParsedInbound, staff?: AuthUser): Promise<boolean> {
    if (!this.isDocsCommand(parsed.text)) return false;

    const user = staff ?? (await this.findStaffUser(parsed.userId));
    if (!user) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Команда /docs для менеджерів CRM. Прив'яжіть акаунт: Налаштування → Telegram → /link.",
      );
      return true;
    }

    const match = parsed.text!.trim().match(/^\/docs(?:@\w+)?(?:\s+(.+))?$/i);
    const query = match?.[1]?.trim() ?? "";
    if (!query) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Документи PDF:\n" +
          "• /docs <номер замовлення>\n" +
          "• /client — знайти клієнта → замовлення → надіслати собі або клієнту\n\n" +
          "Приклад: /docs 121",
      );
      return true;
    }

    const order = await this.findOrderByNumber(query, user);
    if (!order) {
      await this.telegram.sendMessageToChat(parsed.chatId, `Замовлення «${query}» не знайдено.`);
      return true;
    }

    const clientChatId = await this.resolveClientTelegramChatId(
      order.contactId,
      order.clientId,
    );
    await this.sessions.set(parsed.userId, "idle", {
      mgrOrderId: order.id,
      mgrContactId: order.contactId ?? order.clientId ?? undefined,
      mgrClientChatId: clientChatId,
    });
    await this.replyOrderDocMenu(parsed.chatId, order.orderNumber, Boolean(clientChatId));
    return true;
  }

  async handleCallback(parsed: ParsedInbound): Promise<boolean> {
    const data = parsed.text?.trim() ?? "";
    if (!this.isManagerCallback(data)) return false;

    if (parsed.callbackQueryId) {
      try {
        await this.telegram.answerCallbackQuery(parsed.callbackQueryId);
      } catch {
        /* expired */
      }
    }

    const user = await this.findStaffUser(parsed.userId);
    if (!user) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Ця кнопка для менеджерів CRM. Прив'яжіть акаунт: Налаштування → Telegram → /link.",
      );
      return true;
    }

    const parts = data.split(":");
    const action = parts[1];
    const entityId = parts[2];
    if (!action) {
      await this.telegram.sendMessageToChat(parsed.chatId, "Невідома дія.");
      return true;
    }

    const actor = this.toActor(user);

    try {
      if (action === "claim" && entityId) {
        await this.conversations.assign(entityId, user.id, actor);
        await this.telegram.sendMessageToChat(
          parsed.chatId,
          "✅ Чат закріплено за вами. Відповідь — у CRM Inbox.",
        );
        return true;
      }
      if (action === "mute" && entityId) {
        this.inboxNotifier.muteConversation(user.id, entityId, 30 * 60 * 1000);
        await this.telegram.sendMessageToChat(
          parsed.chatId,
          "🔕 Сповіщення по цьому чату вимкнено на 30 хвилин.",
        );
        return true;
      }
      if (action === "open" && entityId) {
        const url = await this.inboxUrl(entityId);
        await this.telegram.sendMessageToChat(
          parsed.chatId,
          url ? `Відкрити в CRM:\n${url}` : "Відкрийте Inbox у CRM (веб).",
        );
        return true;
      }
      if (action === "c" && entityId != null) {
        await this.pickContact(parsed, actor, Number(entityId));
        return true;
      }
      if (action === "o" && entityId != null) {
        await this.pickOrder(parsed, actor, Number(entityId));
        return true;
      }
      if ((action === "inv" || action === "way") && entityId) {
        // Alert buttons: always to manager.
        await this.sendOrderDocument(parsed, entityId, action, actor, "me");
        return true;
      }
      if ((action === "invc" || action === "wayc") && entityId) {
        await this.sendOrderDocument(
          parsed,
          entityId,
          action === "invc" ? "inv" : "way",
          actor,
          "client",
        );
        return true;
      }
      if (action === "invme" || action === "wayme" || action === "invcl" || action === "waycl") {
        const session = await this.sessions.get(parsed.userId);
        const orderId = session.payload.mgrOrderId;
        if (!orderId) {
          await this.telegram.sendMessageToChat(
            parsed.chatId,
            "Спочатку оберіть замовлення: /client або /docs <номер>.",
          );
          return true;
        }
        const kind = action.startsWith("inv") ? "inv" : "way";
        const dest = action.endsWith("cl") ? "client" : "me";
        await this.sendOrderDocument(parsed, orderId, kind, actor, dest);
        return true;
      }
    } catch (err) {
      this.logger.warn(
        `mgr callback ${action}: ${err instanceof Error ? err.message : String(err)}`,
      );
      const msg =
        err instanceof ForbiddenException
          ? "Немає доступу."
          : err instanceof NotFoundException
            ? "Не знайдено."
            : "Не вдалося виконати дію. Спробуйте в CRM.";
      await this.telegram.sendMessageToChat(parsed.chatId, msg);
      return true;
    }

    await this.telegram.sendMessageToChat(parsed.chatId, "Невідома дія.");
    return true;
  }

  private async startClientSearch(parsed: ParsedInbound, user: AuthUser): Promise<void> {
    void user;
    await this.sessions.set(parsed.userId, "mgr_search", {});
    await this.telegram.sendMessageToChat(
      parsed.chatId,
      "Пошук клієнта для документів.\nНапишіть телефон або прізвище/ім'я:\n\n/cancel — скасувати",
    );
  }

  private async runClientSearch(
    parsed: ParsedInbound,
    user: AuthUser,
    query: string,
  ): Promise<void> {
    const hits = await this.searchContacts(query, user);
    if (hits.length === 0) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        `Нічого не знайдено за «${query}». Спробуйте інший запит або /cancel.`,
      );
      return;
    }

    const mgrContactHits = hits.map((h) => ({
      id: h.id,
      label: h.label,
      hasTelegram: h.hasTelegram,
    }));
    await this.sessions.set(parsed.userId, "idle", { mgrContactHits });

    const rows: TelegramInlineButton[][] = mgrContactHits.map((h, index) => [
      {
        text: `${h.hasTelegram ? "📲" : "👤"} ${h.label}`.slice(0, 64),
        callback_data: `mgr:c:${index}`,
      },
    ]);
    await this.telegram.sendMessageToChat(
      parsed.chatId,
      `Знайдено ${hits.length}. Оберіть клієнта:`,
      { inlineKeyboard: rows },
    );
  }

  private async pickContact(
    parsed: ParsedInbound,
    actor: AuthUser,
    index: number,
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    const hit = session.payload.mgrContactHits?.[index];
    if (!hit) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Список застарів. Напишіть /client і пошукайте знову.",
      );
      return;
    }

    const clientChatId = await this.resolveClientTelegramChatId(hit.id, hit.id);
    const orders = await this.listOrdersForContact(hit.id, actor);
    if (orders.length === 0) {
      await this.sessions.set(parsed.userId, "idle", {
        mgrContactId: hit.id,
        mgrClientChatId: clientChatId,
      });
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        `У клієнта «${hit.label}» немає доступних замовлень.`,
      );
      return;
    }

    const mgrOrderHits = orders.map((o) => ({
      id: o.id,
      label: `№${o.orderNumber} · ${o.totalLabel}`,
    }));
    await this.sessions.set(parsed.userId, "idle", {
      mgrContactId: hit.id,
      mgrClientChatId: clientChatId,
      mgrOrderHits,
    });

    const rows: TelegramInlineButton[][] = mgrOrderHits.map((o, i) => [
      { text: o.label.slice(0, 64), callback_data: `mgr:o:${i}` },
    ]);
    const tgNote = clientChatId
      ? "Telegram клієнта підключено — можна надіслати PDF у його чат."
      : "Telegram клієнта немає — документи лише собі.";
    await this.telegram.sendMessageToChat(
      parsed.chatId,
      `${hit.label}\n${tgNote}\n\nОберіть замовлення:`,
      { inlineKeyboard: rows },
    );
  }

  private async pickOrder(
    parsed: ParsedInbound,
    actor: AuthUser,
    index: number,
  ): Promise<void> {
    void actor;
    const session = await this.sessions.get(parsed.userId);
    const hit = session.payload.mgrOrderHits?.[index];
    if (!hit) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Список замовлень застарів. Почніть з /client.",
      );
      return;
    }
    const next: BotSessionPayload = {
      ...session.payload,
      mgrOrderId: hit.id,
    };
    await this.sessions.set(parsed.userId, "idle", next);
    const orderNumber = hit.label.replace(/^№/, "").split("·")[0]?.trim() ?? hit.label;
    await this.replyOrderDocMenu(
      parsed.chatId,
      orderNumber,
      Boolean(session.payload.mgrClientChatId),
    );
  }

  private async replyOrderDocMenu(
    chatId: string,
    orderNumber: string,
    hasClientTelegram: boolean,
  ): Promise<void> {
    const rows: TelegramInlineButton[][] = [
      [
        { text: "📄 Рахунок → мені", callback_data: "mgr:invme" },
        { text: "📄 РН → мені", callback_data: "mgr:wayme" },
      ],
    ];
    if (hasClientTelegram) {
      rows.push([
        { text: "📤 Рахунок → клієнту", callback_data: "mgr:invcl" },
        { text: "📤 РН → клієнту", callback_data: "mgr:waycl" },
      ]);
    }
    await this.telegram.sendMessageToChat(
      chatId,
      `Замовлення №${orderNumber} — куди надіслати PDF?`,
      { inlineKeyboard: rows },
    );
  }

  private async sendOrderDocument(
    parsed: ParsedInbound,
    orderId: string,
    kind: "inv" | "way",
    actor: AuthUser,
    dest: "me" | "client",
  ): Promise<void> {
    const managerChatId = parsed.chatId;
    await this.telegram.sendMessageToChat(managerChatId, "Готую PDF…");
    const docKind = kind === "inv" ? "invoice" : "waybill";
    const label = kind === "inv" ? "Рахунок" : "Видаткова накладна (РН)";

    const session = await this.sessions.get(parsed.userId);
    const sessionClientChatId = session.payload.mgrClientChatId ?? null;

    try {
      await this.orderTelegramDocuments.sendDocument(orderId, docKind, dest, actor, {
        managerChatId,
        clientChatId: dest === "client" ? sessionClientChatId : null,
      });
      if (dest === "client") {
        await this.telegram.sendMessageToChat(
          managerChatId,
          `✅ ${label} надіслано клієнту в Telegram.`,
        );
      }
    } catch (err) {
      if (dest === "client" && err instanceof BadRequestException) {
        await this.telegram.sendMessageToChat(
          managerChatId,
          "У клієнта немає прив'язаного Telegram. Надсилаю вам.",
        );
        await this.orderTelegramDocuments.sendDocument(orderId, docKind, "me", actor, {
          managerChatId,
        });
        return;
      }
      throw err;
    }
  }

  private async searchContacts(
    query: string,
    actor: AuthUser,
  ): Promise<Array<{ id: string; label: string; hasTelegram: boolean }>> {
    const digits = getPhoneNormalizedDigits(query);
    const ownerFilter: Prisma.ContactWhereInput =
      actor.role === UserRole.MANAGER ? { ownerId: actor.id } : {};

    let where: Prisma.ContactWhereInput;
    if (digits && digits.length >= 6) {
      const candidates = getPhoneCandidatesForLookup(digits);
      where = {
        ...ownerFilter,
        OR: [
          ...candidates.map((c) => ({ phoneNormalized: { contains: c } })),
          ...candidates.map((c) => ({
            phones: { some: { phoneNormalized: { contains: c } } },
          })),
        ],
      };
    } else {
      const q = query.trim();
      where = {
        ...ownerFilter,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { documentDisplayName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const rows = await this.prisma.contact.findMany({
      where,
      take: CONTACT_HIT_LIMIT,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        documentDisplayName: true,
        telegramAccounts: { select: { telegramChatId: true }, take: 1 },
      },
    });

    return rows.map((r) => {
      const name =
        r.documentDisplayName?.trim() ||
        [r.lastName, r.firstName].filter(Boolean).join(" ").trim() ||
        "Без імені";
      const phone = r.phone?.trim() ? ` · ${r.phone.trim()}` : "";
      return {
        id: r.id,
        label: `${name}${phone}`.slice(0, 60),
        hasTelegram: Boolean(r.telegramAccounts[0]?.telegramChatId),
      };
    });
  }

  private async listOrdersForContact(
    contactId: string,
    actor: AuthUser,
  ): Promise<Array<{ id: string; orderNumber: string; totalLabel: string }>> {
    const ownerFilter =
      actor.role === UserRole.MANAGER ? { ownerId: actor.id } : {};
    const rows = await this.prisma.order.findMany({
      where: {
        ...ownerFilter,
        OR: [{ contactId }, { clientId: contactId }],
      },
      take: ORDER_HIT_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
      },
    });
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      totalLabel: `${Math.round(o.totalAmount)} ${o.currency || "UAH"}`,
    }));
  }

  private async resolveClientTelegramChatId(
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

  private async findOrderByNumber(
    query: string,
    actor: AuthUser,
  ): Promise<{
    id: string;
    orderNumber: string;
    contactId: string | null;
    clientId: string | null;
  } | null> {
    const raw = query.trim().replace(/^№\s*/u, "");
    if (!raw) return null;
    const ownerFilter =
      actor.role === UserRole.MANAGER ? { ownerId: actor.id } : {};
    const select = {
      id: true,
      orderNumber: true,
      contactId: true,
      clientId: true,
    } as const;
    const byExact = await this.prisma.order.findFirst({
      where: { orderNumber: raw, ...ownerFilter },
      select,
    });
    if (byExact) return byExact;
    return this.prisma.order.findFirst({
      where: { orderNumber: { equals: raw, mode: "insensitive" }, ...ownerFilter },
      select,
    });
  }

  private async findStaffUser(telegramUserId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        telegramUserId,
        isActive: true,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { id: true, role: true, fullName: true, email: true },
    });
    return user ? this.toActor(user) : null;
  }

  async resolveCrmWebBase(): Promise<string | null> {
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

  async inboxUrl(conversationId: string): Promise<string | null> {
    const base = await this.resolveCrmWebBase();
    if (!base) return null;
    return `${base}/inbox?channel=TELEGRAM&conversationId=${encodeURIComponent(conversationId)}`;
  }

  private toActor(user: {
    id: string;
    role: UserRole;
    fullName: string | null;
    email: string;
  }): AuthUser {
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      fullName: user.fullName?.trim() || user.email,
    };
  }
}
