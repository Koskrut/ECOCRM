import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConversationChannel, ConversationStatus, MessageDirection } from "@prisma/client";
import { LeadSource } from "@prisma/client";
import { LeadStatus } from "@prisma/client";
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
    const msg = update.message ?? update.edited_message;
    if (!msg?.chat?.id || !msg.from?.id) return null;

    const from = msg.from;
    const chat = msg.chat;
    const text = typeof msg.text === "string" ? msg.text : null;
    const phone =
      msg.contact?.phone_number != null ? normalizePhoneDigits(msg.contact.phone_number) : null;
    const date = msg.date != null ? new Date(msg.date * 1000) : new Date();

    return {
      chatId: String(chat.id),
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

    // CRM user link: /link TOKEN
    const linkMatch = parsed.text?.match(/^\/link\s+(\S+)/);
    if (linkMatch) {
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
        }
      }

      if (!contactId && !leadId) {
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
              firstName: parsed.firstName,
              lastName: parsed.lastName ?? "Telegram",
              middleName: null,
              fullName: [parsed.firstName, parsed.lastName].filter(Boolean).join(" ") || null,
              name: [parsed.firstName, parsed.lastName].filter(Boolean).join(" ") || null,
              phone: parsed.phone,
              phoneNormalized: parsed.phone ? normalizePhoneDigits(parsed.phone) : null,
            },
          });
          leadId = lead.id;
          await this.prisma.telegramAccount.update({
            where: { id: account.id },
            data: { leadId },
          });
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
      }
    }

    // Update Lead/Contact if phone is provided and they are missing it
    if (parsed.phone) {
      const phoneNorm = normalizePhoneDigits(parsed.phone);
      const placeholderPhone = "0" + parsed.userId.replace(/\D/g, "").slice(-10).padStart(10, "0");

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
            dataToUpdate.fullName = [nextFirst, nextLast].filter(Boolean).join(" ") || null;
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
          if (!contact.lastName || contact.lastName === "User" || contact.lastName === "Telegram") {
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

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        text: parsed.text,
        tgMessageId: String(parsed.messageId),
        sentAt: parsed.date,
      },
    });

    const trimmed = parsed.text?.trim() ?? "";
    const isHelp = trimmed.toLowerCase() === "/help";
    const isStartPlain =
      trimmed.toLowerCase() === "/start" ||
      (trimmed.toLowerCase().startsWith("/start") && trimmed.length <= 6);
    const inboundCount = await this.prisma.message.count({
      where: { conversationId: conversation.id, direction: MessageDirection.INBOUND },
    });

    if (isHelp) {
      await this.sendMessageToChat(parsed.chatId, TELEGRAM_HELP);
    } else if (isStartPlain) {
      await this.sendMessageToChat(parsed.chatId, TELEGRAM_WELCOME, { requestContactButton: true });
    } else if (inboundCount === 1) {
      await this.sendMessageToChat(parsed.chatId, TELEGRAM_AUTO_REPLY);
    }
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
    const existing = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId: params.telegramUserId },
    });

    if (existing) {
      return this.prisma.telegramAccount.update({
        where: { id: existing.id },
        data: {
          telegramChatId: params.telegramChatId,
          username: params.username ?? existing.username,
          firstName: params.firstName ?? existing.firstName,
          lastName: params.lastName ?? existing.lastName,
          middleName: params.middleName ?? existing.middleName,
          phone: params.phone ?? existing.phone,
          lastMessageAt: params.lastMessageAt,
        },
      });
    }

    return this.prisma.telegramAccount.create({
      data: {
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
  }

  /**
   * Send text message to Telegram chat via Bot API. Returns Telegram message_id.
   * Optionally show Reply keyboard with "Share phone" button (request_contact).
   */
  async sendMessageToChat(
    telegramChatId: string,
    text: string,
    options?: { requestContactButton?: boolean },
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
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

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
