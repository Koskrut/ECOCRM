import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConversationChannel, ConversationStatus, MessageDirection } from "@prisma/client";
import { LeadSource } from "@prisma/client";
import { LeadStatus } from "@prisma/client";
import { OrderStage } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AuthService } from "../../auth/auth.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { ParsedInbound, TelegramUpdate } from "./telegram.types";

function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

const TELEGRAM_WELCOME =
  "Вітаємо! Щоб ми могли швидше з вами зв'язатися, натисніть кнопку нижче або напишіть, що вас цікавить.";
const TELEGRAM_HELP =
  "Тут ви можете написати нам. Менеджер відповість у робочий час. Напишіть будь-яке повідомлення — ми його отримаємо.";
const TELEGRAM_AUTO_REPLY =
  "Дякуємо за звернення. Ми отримали ваше повідомлення, менеджер відповість найближчим часом.";
const TELEGRAM_REQUEST_PHONE =
  "Щоб ідентифікувати вас у CRM, поділіться номером телефону кнопкою нижче.";
const TELEGRAM_EXISTING_CLIENT =
  "Ви вже є нашим клієнтом у базі. Оберіть дію в меню нижче або напишіть повідомлення менеджеру.";
const TELEGRAM_NEW_CLIENT_PROFILE_REQUEST =
  "Номер не знайдено в базі. Будь ласка, надішліть одним повідомленням: Область, Прізвище, Ім'я.\nПриклад: Київська область, Іваненко, Олена";
const MENU_ORDER_STATUS = "📦 Статус замовлення";
const MENU_MANAGER_CHAT = "💬 Написати менеджеру";
const MENU_CONTACT_US = "📞 Зв'язатись з нами";
const CLIENT_MENU_BUTTONS = [MENU_ORDER_STATUS, MENU_MANAGER_CHAT, MENU_CONTACT_US];
const ORDER_STAGE_LABELS: Partial<Record<OrderStage, string>> = {
  NEW: "🆕 Нове замовлення",
  IN_WORK: "🟡 В обробці",
  WAITING_PAYMENT: "💳 Очікує оплату",
  READY_TO_SHIP: "📦 Готове до відправки",
  SHIPPED: "🚚 Відправлено",
  COMPLETED: "✅ Виконано",
  CANCELED: "❌ Скасовано",
};
const ORDER_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  NEW: "🆕 Нове замовлення",
  IN_PROGRESS: "🟡 В обробці",
  PAID: "💰 Оплачено",
  SHIPPED: "🚚 Відправлено",
  COMPLETED: "✅ Виконано",
  CANCELLED: "❌ Скасовано",
};

function parseProfileInput(text: string): { region: string; lastName: string; firstName: string } | null {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const [region, lastName, firstName] = parts;
  if (!region || !lastName || !firstName) return null;
  if (region.length < 2 || lastName.length < 2 || firstName.length < 2) return null;
  return { region, lastName, firstName };
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
  ) {}

  /**
   * Extract message payload from Telegram Update. Returns null if no message to process.
   */
  parseInbound(update: TelegramUpdate): ParsedInbound | null {
    const msg = update.message;
    if (!msg?.chat?.id || !msg.from?.id) return null;

    const from = msg.from;
    const chat = msg.chat;
    const text = typeof msg.text === "string" ? msg.text : null;
    const phone =
      msg.contact?.phone_number != null ? normalizePhoneDigits(msg.contact.phone_number) : null;
    const date = msg.date != null ? new Date(msg.date * 1000) : new Date();

    return {
      chatId: String(chat.id),
      chatType: chat.type ?? null,
      userId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      phone: phone && phone.length >= 5 ? msg.contact!.phone_number! : null,
      messageId: msg.message_id,
      date,
      text,
    };
  }

  /**
   * Handle incoming webhook update: upsert account, find/create conversation,
   * link contact/lead, create inbound message.
   */
  async handleInboundUpdate(update: TelegramUpdate): Promise<void> {
    const parsed = this.parseInbound(update);
    if (!parsed) return;
    const updateId = String(update.update_id);

    try {
      await this.prisma.telegramInboundUpdate.create({
        data: { updateId, telegramChatId: parsed.chatId },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return;
      }
      throw error;
    }

    try {
      // CRM user link: /link TOKEN
      const linkMatch = parsed.text?.match(/^\/link\s+(\S+)/);
      if (linkMatch) {
        if (parsed.chatType !== "private") {
          await this.sendMessageToChat(
            parsed.chatId,
            "Команда /link доступна только в приватном чате с ботом.",
          );
          return;
        }
        try {
          const { email } = await this.authService.confirmTelegramLink(
            linkMatch[1],
            parsed.userId,
            parsed.chatId,
          );
          await this.sendMessageToChat(
            parsed.chatId,
            `Telegram привязан к аккаунту CRM (${email}). Теперь вы можете входить через Telegram или получать коды сброса пароля сюда.`,
          );
        } catch {
          await this.sendMessageToChat(
            parsed.chatId,
            "Неверная или просроченная ссылка. Запросите новую в настройках CRM (Настройки → подключить Telegram).",
          );
        }
        return;
      }

      // Minimal log (no token)
      if (process.env.NODE_ENV !== "test") {
        console.log(
          "[Telegram] inbound chatId=%s userId=%s hasText=%s",
          parsed.chatId,
          parsed.userId,
          !!parsed.text,
        );
      }

      const now = new Date();
      let shouldSendExistingClientMenu = false;
      let shouldRequestProfileDetails = false;

      const account = await this.upsertTelegramAccount({
        telegramUserId: parsed.userId,
        telegramChatId: parsed.chatId,
        username: parsed.username,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        middleName: null,
        phone: parsed.phone,
        lastMessageAt: now,
      });

      let contactId: string | null = account.contactId;
      if (parsed.text && parsed.text.startsWith("/start ")) {
        const token = parsed.text.slice(7).trim();
        if (token) {
          const linkRow = await this.prisma.storeTelegramLinkToken.findUnique({
            where: { token },
          });
          if (linkRow && linkRow.expiresAt >= now) {
            await this.prisma.$transaction([
              this.prisma.telegramAccount.updateMany({
                where: { telegramChatId: parsed.chatId },
                data: { contactId: linkRow.contactId, leadId: null },
              }),
              this.prisma.conversation.updateMany({
                where: { telegramChatId: parsed.chatId },
                data: { contactId: linkRow.contactId, leadId: null },
              }),
            ]);
            await this.prisma.storeTelegramLinkToken
              .delete({ where: { id: linkRow.id } })
              .catch(() => {});
            contactId = linkRow.contactId;
          }
        }
      }

      let leadId: string | null = account.leadId;

      if (!contactId && !leadId) {
        if (parsed.phone) {
          const phoneNorm = normalizePhoneDigits(parsed.phone);
          const contact = await this.prisma.contact.findUnique({
            where: { phoneNormalized: phoneNorm },
            select: { id: true },
          });
          if (contact) {
            contactId = contact.id;
            await this.prisma.telegramAccount.update({
              where: { id: account.id },
              data: { contactId },
            });
            shouldSendExistingClientMenu = true;
          } else {
            const existingLead = await this.prisma.lead.findFirst({
              where: { phoneNormalized: phoneNorm },
              select: { id: true },
            });
            if (existingLead) {
              leadId = existingLead.id;
              await this.prisma.telegramAccount.update({
                where: { id: account.id },
                data: { leadId },
              });
              shouldSendExistingClientMenu = true;
            }
          }
        }

        if (!contactId && !leadId) {
          if (parsed.phone) {
            const secrets = await this.settings.getTelegramSecrets();
            const companyId =
              secrets.leadCompanyId ||
              (process.env.TELEGRAM_LEAD_COMPANY_ID as string) ||
              (await this.prisma.company.findFirst({ select: { id: true } }))?.id;

            if (companyId) {
              const lead = await this.prisma.lead.create({
                data: {
                  companyId,
                  status: LeadStatus.NEW,
                  source: LeadSource.TELEGRAM,
                  firstName: parsed.firstName ?? "Telegram",
                  lastName: parsed.lastName ?? "User",
                  middleName: null,
                  fullName: [parsed.lastName, parsed.firstName].filter(Boolean).join(" ") || null,
                  name: [parsed.lastName, parsed.firstName].filter(Boolean).join(" ") || null,
                  phone: parsed.phone,
                  phoneNormalized: parsed.phone ? normalizePhoneDigits(parsed.phone) : null,
                },
              });
              leadId = lead.id;
              await this.prisma.telegramAccount.update({
                where: { id: account.id },
                data: { leadId },
              });
              shouldRequestProfileDetails = true;
            } else {
              const placeholderPhone =
                "0" + parsed.userId.replace(/\D/g, "").slice(-10).padStart(10, "0");
              const contact = await this.prisma.contact.create({
                data: {
                  firstName: parsed.firstName ?? "Telegram",
                  lastName: parsed.lastName ?? "User",
                  phone: placeholderPhone,
                  phoneNormalized: placeholderPhone,
                },
              });
              contactId = contact.id;
              await this.prisma.telegramAccount.update({
                where: { id: account.id },
                data: { contactId },
              });
            }
          } else {
            await this.sendMessageToChat(parsed.chatId, TELEGRAM_REQUEST_PHONE, {
              requestContactButton: true,
            });
          }
        }
      }

      if (leadId && parsed.text && !parsed.phone) {
        const existingLead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            source: true,
            region: true,
            firstName: true,
            lastName: true,
          },
        });
        const needsProfile =
          existingLead?.source === LeadSource.TELEGRAM &&
          !existingLead.region &&
          (!existingLead.firstName ||
            existingLead.firstName === "Telegram" ||
            !existingLead.lastName ||
            existingLead.lastName === "Telegram" ||
            existingLead.lastName === "User");
        if (needsProfile) {
          const profile = parseProfileInput(parsed.text);
          if (profile) {
            await this.prisma.lead.update({
              where: { id: leadId },
              data: {
                region: profile.region,
                firstName: profile.firstName,
                lastName: profile.lastName,
                fullName: [profile.lastName, profile.firstName].filter(Boolean).join(" ") || null,
                name: [profile.lastName, profile.firstName].filter(Boolean).join(" ") || null,
              },
            });
          } else if (!parsed.text.startsWith("/")) {
            shouldRequestProfileDetails = true;
          }
        }
      }

      // Update Lead/Contact if phone is provided and they are missing it
      if (parsed.phone) {
        const phoneNorm = normalizePhoneDigits(parsed.phone);
        const placeholderPhone =
          "0" + parsed.userId.replace(/\D/g, "").slice(-10).padStart(10, "0");

        if (leadId) {
          const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
          if (lead) {
            const dataToUpdate: any = {};
            if (!lead.phone || lead.phone === placeholderPhone || lead.phone.startsWith("0000")) {
              dataToUpdate.phone = parsed.phone;
              dataToUpdate.phoneNormalized = phoneNorm;
            }
            if (!lead.firstName || lead.firstName === "Telegram") {
              dataToUpdate.firstName = parsed.firstName ?? "Telegram";
            }
            if (!lead.lastName || lead.lastName === "Telegram" || lead.lastName === "User") {
              dataToUpdate.lastName = parsed.lastName ?? "Telegram";
            }
            if (Object.keys(dataToUpdate).length > 0) {
              const nextFirst =
                dataToUpdate.firstName !== undefined ? dataToUpdate.firstName : lead.firstName;
              const nextLast =
                dataToUpdate.lastName !== undefined ? dataToUpdate.lastName : lead.lastName;
              dataToUpdate.fullName = [nextLast, nextFirst].filter(Boolean).join(" ") || null;
              dataToUpdate.name = dataToUpdate.fullName;
              await this.prisma.lead.update({ where: { id: leadId }, data: dataToUpdate });
            }
          }
        }

        if (contactId) {
          const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
          if (contact) {
            const dataToUpdate: any = {};
            if (
              !contact.phone ||
              contact.phone === placeholderPhone ||
              contact.phone.startsWith("0000")
            ) {
              const existingByPhone = await this.prisma.contact.findUnique({
                where: { phoneNormalized: phoneNorm },
              });
              if (!existingByPhone || existingByPhone.id === contactId) {
                dataToUpdate.phone = parsed.phone;
                dataToUpdate.phoneNormalized = phoneNorm;
              }
            }
            if (!contact.firstName || contact.firstName === "Telegram") {
              dataToUpdate.firstName = parsed.firstName ?? "Telegram";
            }
            if (
              !contact.lastName ||
              contact.lastName === "User" ||
              contact.lastName === "Telegram"
            ) {
              dataToUpdate.lastName = parsed.lastName ?? "User";
            }
            if (Object.keys(dataToUpdate).length > 0) {
              await this.prisma.contact.update({ where: { id: contactId }, data: dataToUpdate });
            }
          }
        }
      }

      let conversation = await this.prisma.conversation.findUnique({
        where: { telegramChatId: parsed.chatId },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            channel: ConversationChannel.TELEGRAM,
            telegramChatId: parsed.chatId,
            contactId,
            leadId,
            status: ConversationStatus.OPEN,
            lastMessageAt: now,
          },
        });
      } else {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            contactId: contactId ?? conversation.contactId,
            leadId: leadId ?? conversation.leadId,
            lastMessageAt: now,
          },
        });
      }

      try {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: MessageDirection.INBOUND,
            text: parsed.text,
            tgMessageId: String(parsed.messageId),
            sentAt: parsed.date,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          return;
        }
        throw error;
      }

      const trimmed = parsed.text?.trim() ?? "";
      const isHelp = trimmed.toLowerCase() === "/help";
      const isStartPlain =
        trimmed.toLowerCase() === "/start" ||
        (trimmed.toLowerCase().startsWith("/start") && trimmed.length <= 6);
      const inboundCount = await this.prisma.message.count({
        where: { conversationId: conversation.id, direction: MessageDirection.INBOUND },
      });
      const handledByMenu = await this.handleClientMenuAction(
        parsed.chatId,
        trimmed,
        contactId,
        leadId,
      );

      if (isHelp) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_HELP);
      } else if (isStartPlain) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_WELCOME, {
          requestContactButton: true,
        });
      } else if (handledByMenu) {
        // Menu button handled and response already sent.
      } else if (shouldSendExistingClientMenu) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_EXISTING_CLIENT, {
          menuButtons: CLIENT_MENU_BUTTONS,
        });
      } else if (shouldRequestProfileDetails) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_NEW_CLIENT_PROFILE_REQUEST);
      } else if (inboundCount === 1) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_AUTO_REPLY);
      }
    } catch (error) {
      await this.prisma.telegramInboundUpdate.deleteMany({ where: { updateId } });
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private async handleClientMenuAction(
    chatId: string,
    text: string,
    contactId: string | null,
    leadId: string | null,
  ): Promise<boolean> {
    if (!text) return false;

    if (text === MENU_MANAGER_CHAT) {
      await this.sendMessageToChat(
        chatId,
        "Напишіть ваше запитання одним повідомленням у цьому чаті. Менеджер отримає його та відповість якнайшвидше.",
        { menuButtons: CLIENT_MENU_BUTTONS },
      );
      return true;
    }

    if (text === MENU_CONTACT_US) {
      await this.sendMessageToChat(
        chatId,
        "Наш менеджер на зв'язку у робочий час. Напишіть, будь ласка, ваш запит у чат — і ми зв'яжемось з вами.",
        { menuButtons: CLIENT_MENU_BUTTONS },
      );
      return true;
    }

    if (text !== MENU_ORDER_STATUS) return false;

    const resolvedContactId = await this.resolveContactIdForOrders(contactId, leadId);
    if (!resolvedContactId) {
      await this.sendMessageToChat(
        chatId,
        "Щоб показати статус замовлення, спочатку поділіться номером телефону або напишіть менеджеру.",
        { menuButtons: CLIENT_MENU_BUTTONS },
      );
      return true;
    }

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [{ clientId: resolvedContactId }, { contactId: resolvedContactId }],
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        orderNumber: true,
        orderStage: true,
        status: true,
        createdAt: true,
      },
    });

    if (orders.length === 0) {
      await this.sendMessageToChat(
        chatId,
        "У CRM поки не знайдено ваших замовлень. Напишіть менеджеру, і ми швидко перевіримо вручну.",
        { menuButtons: CLIENT_MENU_BUTTONS },
      );
      return true;
    }

    const lines = orders.map((o) => {
      const stage = this.humanOrderStatus(o.orderStage, o.status);
      const created = o.createdAt.toLocaleDateString("uk-UA");
      return `• №${o.orderNumber} — ${stage} (${created})`;
    });
    await this.sendMessageToChat(chatId, `Останні замовлення:\n${lines.join("\n")}`, {
      menuButtons: CLIENT_MENU_BUTTONS,
    });
    return true;
  }

  private async resolveContactIdForOrders(
    contactId: string | null,
    leadId: string | null,
  ): Promise<string | null> {
    if (contactId) return contactId;
    if (!leadId) return null;
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { contactId: true },
    });
    return lead?.contactId ?? null;
  }

  private humanOrderStatus(orderStage: OrderStage | null, status: OrderStatus | null): string {
    if (orderStage) return ORDER_STAGE_LABELS[orderStage] ?? orderStage;
    if (status) return ORDER_STATUS_LABELS[status] ?? status;
    return "🆕 Нове замовлення";
  }

  private async upsertTelegramAccount(params: {
    telegramUserId: string;
    telegramChatId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    phone: string | null;
    lastMessageAt: Date;
  }) {
    try {
      return await this.prisma.telegramAccount.upsert({
        where: { telegramUserId: params.telegramUserId },
        update: {
          telegramChatId: params.telegramChatId,
          username: params.username ?? undefined,
          firstName: params.firstName ?? undefined,
          lastName: params.lastName ?? undefined,
          middleName: params.middleName ?? undefined,
          phone: params.phone ?? undefined,
          lastMessageAt: params.lastMessageAt,
        },
        create: {
          telegramUserId: params.telegramUserId,
          telegramChatId: params.telegramChatId,
          username: params.username,
          firstName: params.firstName,
          lastName: params.lastName,
          middleName: params.middleName,
          phone: params.phone,
          lastMessageAt: params.lastMessageAt,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const byChat = await this.prisma.telegramAccount.findUnique({
        where: { telegramChatId: params.telegramChatId },
      });
      if (!byChat) throw error;

      return this.prisma.telegramAccount.update({
        where: { id: byChat.id },
        data: {
          telegramUserId: params.telegramUserId,
          username: params.username ?? byChat.username,
          firstName: params.firstName ?? byChat.firstName,
          lastName: params.lastName ?? byChat.lastName,
          middleName: params.middleName ?? byChat.middleName,
          phone: params.phone ?? byChat.phone,
          lastMessageAt: params.lastMessageAt,
        },
      });
    }
  }

  /**
   * Send text message to Telegram chat via Bot API. Returns Telegram message_id.
   * Optionally show Reply keyboard with "Share phone" button (request_contact).
   */
  async sendMessageToChat(
    telegramChatId: string,
    text: string,
    options?: { requestContactButton?: boolean; menuButtons?: string[] },
  ): Promise<{ messageId: number }> {
    const secrets = await this.settings.getTelegramSecrets();
    const token = secrets.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!token)
      throw new Error("Telegram bot token is not set. Configure it in Settings → Telegram.");

    const body: Record<string, unknown> = {
      chat_id: telegramChatId,
      text,
    };
    if (options?.requestContactButton) {
      body.reply_markup = {
        keyboard: [[{ text: "📱 Поділитися номером", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      };
    } else if (options?.menuButtons?.length) {
      body.reply_markup = {
        keyboard: options.menuButtons.map((button) => [{ text: button }]),
        resize_keyboard: true,
      };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Telegram API request failed: ${msg}`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { ok: boolean; result?: { message_id?: number } };
    if (!data.ok || data.result?.message_id == null) {
      throw new Error("Telegram API: missing message_id in response");
    }
    return { messageId: data.result.message_id };
  }
}
