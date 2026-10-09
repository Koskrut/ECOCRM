import { BadRequestException, forwardRef, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConversationChannel, ConversationStatus, MessageDirection } from "@prisma/client";
import { LeadSource } from "@prisma/client";
import { LeadStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AuthService } from "../../auth/auth.service";
import { getPhoneCandidatesForLookup, getPhoneNormalizedDigits } from "../../common/phone.utils";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { ContactsService } from "../../contacts/contacts.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type {
  ParsedInbound,
  SendMessageOptions,
  TelegramMediaType,
  TelegramMessage,
  TelegramUpdate,
  TelegramWebhookInfo,
} from "./telegram.types";
import {
  CLIENT_MENU_KEYBOARD,
  TELEGRAM_EXISTING_CLIENT,
  TELEGRAM_REQUEST_PHONE,
} from "./telegram-client.constants";
import { TelegramClientBotService } from "./telegram-client-bot.service";
import { TelegramInboxNotifierService } from "./telegram-inbox-notifier.service";

function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** Skip reprocessing a stuck (unprocessed) inbound record only after it is this old. */
const INBOUND_RETRY_STALE_MS = 5 * 60 * 1000;

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly contactsService: ContactsService,
    private readonly phoneEntityLookup: PhoneEntityLookupService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
    private readonly inboxNotifier: TelegramInboxNotifierService,
    @Optional()
    @Inject(forwardRef(() => TelegramClientBotService))
    private readonly clientBot?: TelegramClientBotService,
  ) {}

  /**
   * Extract media kind + file_id from a Telegram message. Returns null for text-only messages.
   */
  private extractMedia(
    msg: TelegramMessage,
  ): { mediaType: TelegramMediaType; fileId: string } | null {
    if (msg.photo?.length) {
      // Largest rendition is last.
      const largest = msg.photo[msg.photo.length - 1];
      return { mediaType: "photo", fileId: largest.file_id };
    }
    if (msg.document) return { mediaType: "document", fileId: msg.document.file_id };
    if (msg.voice) return { mediaType: "voice", fileId: msg.voice.file_id };
    if (msg.audio) return { mediaType: "audio", fileId: msg.audio.file_id };
    if (msg.video) return { mediaType: "video", fileId: msg.video.file_id };
    if (msg.video_note) return { mediaType: "video_note", fileId: msg.video_note.file_id };
    if (msg.sticker) return { mediaType: "sticker", fileId: msg.sticker.file_id };
    return null;
  }

  /** Human-readable placeholder stored as Message.text for media without a caption. */
  private mediaPlaceholderText(mediaType: TelegramMediaType | null): string | null {
    if (!mediaType) return null;
    const labels: Record<TelegramMediaType, string> = {
      photo: "[фото]",
      document: "[документ]",
      voice: "[голосове повідомлення]",
      audio: "[аудіо]",
      video: "[відео]",
      video_note: "[відеоповідомлення]",
      sticker: "[стікер]",
    };
    return labels[mediaType];
  }

  /**
   * Extract message payload from Telegram Update, including media and inline-button
   * callbacks. Returns null when there is nothing actionable to process.
   */
  parseInbound(update: TelegramUpdate): ParsedInbound | null {
    // Inline keyboard button press: treat callback data as inbound text so menu
    // handling and idempotency work uniformly.
    const cb = update.callback_query;
    if (cb?.from?.id && cb.message?.chat?.id) {
      const chat = cb.message.chat;
      return {
        chatId: String(chat.id),
        chatType: chat.type ?? null,
        userId: String(cb.from.id),
        username: cb.from.username ?? null,
        firstName: cb.from.first_name ?? null,
        lastName: cb.from.last_name ?? null,
        phone: null,
        messageId: cb.message.message_id,
        date: new Date(),
        text: typeof cb.data === "string" ? cb.data : null,
        mediaType: null,
        fileId: null,
        isCallback: true,
        callbackQueryId: cb.id ?? null,
      };
    }

    const msg = update.message;
    if (!msg?.chat?.id || !msg.from?.id) return null;

    const from = msg.from;
    const chat = msg.chat;
    const media = this.extractMedia(msg);
    const caption = typeof msg.caption === "string" ? msg.caption : null;
    const text = typeof msg.text === "string" ? msg.text : caption;
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
      mediaType: media?.mediaType ?? null,
      fileId: media?.fileId ?? null,
      isCallback: false,
      callbackQueryId: null,
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

    let inboundRecordId: string;
    try {
      const created = await this.prisma.telegramInboundUpdate.create({
        data: { updateId, telegramChatId: parsed.chatId },
      });
      inboundRecordId = created.id;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.telegramInboundUpdate.findUnique({
        where: { updateId },
      });
      // Already processed, or a recent attempt is still in flight: skip to stay idempotent.
      // Only reprocess a record that failed and has since gone stale.
      if (
        !existing ||
        existing.processedAt ||
        existing.createdAt.getTime() > Date.now() - INBOUND_RETRY_STALE_MS
      ) {
        return;
      }
      inboundRecordId = existing.id;
    }

    try {
      // CRM user link: /link TOKEN
      const linkMatch = parsed.text?.match(/^\/link\s+(\S+)/);
      if (linkMatch) {
        if (parsed.chatType !== "private") {
          await this.sendMessageToChat(
            parsed.chatId,
            "Команда /link доступна лише в приватному чаті з ботом.",
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
            `Telegram прив'язано до акаунта CRM (${email}). Тепер ви можете входити через Telegram або отримувати коди для скидання пароля сюди.`,
          );
        } catch {
          await this.sendMessageToChat(
            parsed.chatId,
            "Недійсне або прострочене посилання. Запитайте нове в налаштуваннях CRM (Налаштування → підключити Telegram).",
          );
        }
        return;
      }

      // Minimal log (no token / message content)
      this.logger.debug(
        `inbound chatId=${parsed.chatId} userId=${parsed.userId} hasText=${!!parsed.text}`,
      );

      const now = new Date();
      let shouldSendExistingClientMenu = false;
      let botReplySent = false;

      const trimmedText = parsed.text?.trim() ?? "";
      const isHelpCommand = trimmedText.toLowerCase() === "/help";
      const isStartPlainCommand =
        trimmedText.toLowerCase() === "/start" ||
        (trimmedText.toLowerCase().startsWith("/start") && trimmedText.length <= 6);
      const isCommandMessage =
        isHelpCommand ||
        isStartPlainCommand ||
        trimmedText.startsWith("/") ||
        parsed.isCallback;

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
          const digits =
            getPhoneNormalizedDigits(parsed.phone) ?? normalizePhoneDigits(parsed.phone);
          const candidates = digits ? getPhoneCandidatesForLookup(digits) : [];

          for (const c of candidates) {
            const row = await this.contactsService.findContactByPhone(c);
            if (row) {
              contactId = row.id;
              break;
            }
          }

          if (contactId) {
            await this.prisma.telegramAccount.update({
              where: { id: account.id },
              data: { contactId },
            });
            shouldSendExistingClientMenu = true;
          } else {
            const existingLead =
              candidates.length > 0
                ? await this.prisma.lead.findFirst({
                    where: { OR: candidates.map((phoneNormalized) => ({ phoneNormalized })) },
                    select: { id: true },
                  })
                : null;

            if (existingLead) {
              leadId = existingLead.id;
              await this.prisma.telegramAccount.update({
                where: { id: account.id },
                data: { leadId },
              });
              shouldSendExistingClientMenu = true;
            } else {
              const knownCompanyId =
                candidates.length > 0
                  ? await this.phoneEntityLookup.findCompanyIdByNormalizedKeys(candidates)
                  : null;

              let targetCompanyId: string | null = knownCompanyId;
              if (!targetCompanyId) {
                const secrets = await this.settings.getTelegramSecrets();
                targetCompanyId =
                  secrets.leadCompanyId ||
                  (process.env.TELEGRAM_LEAD_COMPANY_ID as string) ||
                  (await this.prisma.company.findFirst({ select: { id: true } }))?.id ||
                  null;
              }

              if (targetCompanyId) {
                const lead = await this.prisma.lead.create({
                  data: {
                    companyId: targetCompanyId,
                    status: LeadStatus.NEW,
                    source: LeadSource.TELEGRAM,
                    firstName: parsed.firstName ?? "Telegram",
                    lastName: parsed.lastName ?? "User",
                    middleName: null,
                    fullName: [parsed.lastName, parsed.firstName].filter(Boolean).join(" ") || null,
                    name: [parsed.lastName, parsed.firstName].filter(Boolean).join(" ") || null,
                    phone: parsed.phone,
                    phoneNormalized: digits || normalizePhoneDigits(parsed.phone),
                  },
                });
                leadId = lead.id;
                await this.prisma.telegramAccount.update({
                  where: { id: account.id },
                  data: { leadId },
                });
                // Menu is sent by TelegramClientBotService on phone share.
                shouldSendExistingClientMenu = true;
              } else {
                // Phone saved on TelegramAccount only — still show menu via client bot.
                shouldSendExistingClientMenu = true;
              }
            }
          }
        } else if (!isCommandMessage) {
          await this.sendMessageToChat(parsed.chatId, TELEGRAM_REQUEST_PHONE, {
            requestContactButton: true,
          });
          botReplySent = true;
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
            const dataToUpdate: Record<string, unknown> = {};
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
                (dataToUpdate.firstName as string | undefined) !== undefined
                  ? (dataToUpdate.firstName as string)
                  : lead.firstName;
              const nextLast =
                (dataToUpdate.lastName as string | undefined) !== undefined
                  ? (dataToUpdate.lastName as string)
                  : lead.lastName;
              dataToUpdate.fullName = [nextLast, nextFirst].filter(Boolean).join(" ") || null;
              dataToUpdate.name = dataToUpdate.fullName;
              await this.prisma.lead.update({ where: { id: leadId }, data: dataToUpdate });
            }
          }
        }

        if (contactId) {
          const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
          if (contact) {
            const dataToUpdate: Record<string, unknown> = {};
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

      const reopen =
        conversation?.status === ConversationStatus.CLOSED ||
        conversation?.status === ConversationStatus.PENDING;

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
            ...(reopen && !parsed.isCallback ? { status: ConversationStatus.OPEN } : {}),
          },
        });
      }

      // Callbacks are UX-only: do not pollute the transcript with callback_data.
      let fileUrl: string | null = null;
      if (parsed.fileId && !parsed.isCallback) {
        fileUrl = await this.resolveFileUrl(parsed.fileId).catch(() => null);
      }

      if (!parsed.isCallback) {
        try {
          await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              direction: MessageDirection.INBOUND,
              text: parsed.text ?? this.mediaPlaceholderText(parsed.mediaType),
              mediaType: parsed.mediaType,
              fileId: parsed.fileId,
              fileUrl,
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
      }

      // Phone-only contact shares are bot UX — never wake managers.
      let notifyManager = !parsed.isCallback && !parsed.phone;
      if (this.clientBot) {
        const turn = await this.clientBot.handleClientTurn({
          parsed,
          conversationId: conversation.id,
          contactId,
          leadId,
          callbackQueryId: parsed.callbackQueryId,
        });
        if (turn.handled) {
          notifyManager = turn.notifyManager;
        } else if (shouldSendExistingClientMenu && !botReplySent && !parsed.phone) {
          // Fallback when client bot did not handle (should be rare).
          await this.sendMessageToChat(parsed.chatId, TELEGRAM_EXISTING_CLIENT, {
            menuKeyboard: CLIENT_MENU_KEYBOARD,
          });
          notifyManager = false;
        }
      } else if (shouldSendExistingClientMenu && !botReplySent) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_EXISTING_CLIENT, {
          menuKeyboard: CLIENT_MENU_KEYBOARD,
        });
        notifyManager = false;
      }

      if (notifyManager) {
        void this.inboxNotifier.notifyInboundMessage({
          conversationId: conversation.id,
          telegramChatId: parsed.chatId,
          messageText: parsed.text ?? this.mediaPlaceholderText(parsed.mediaType),
        });
      }

      await this.prisma.telegramInboundUpdate
        .update({ where: { id: inboundRecordId }, data: { processedAt: new Date() } })
        .catch(() => {});
    } catch (error) {
      // Keep the idempotency record (do not delete) so a Telegram retry with the
      // same update_id is skipped instead of replaying side effects. Record the
      // error for diagnostics; a stale unprocessed record may be retried later.
      await this.prisma.telegramInboundUpdate
        .update({
          where: { id: inboundRecordId },
          data: {
            processingError:
              error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          },
        })
        .catch(() => {});
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
   */
  async sendMessageToChat(
    telegramChatId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<{ messageId: number }> {
    const body: Record<string, unknown> = {
      chat_id: telegramChatId,
      text,
    };
    this.applyReplyMarkup(body, options);

    const result = await this.callBotApi<{ message_id?: number }>("sendMessage", body);
    if (result?.message_id == null) {
      throw new Error("Telegram API: missing message_id in response");
    }
    return { messageId: result.message_id };
  }

  async sendPhotoToChat(
    telegramChatId: string,
    photoUrl: string,
    options?: SendMessageOptions & { caption?: string },
  ): Promise<{ messageId: number }> {
    const body: Record<string, unknown> = {
      chat_id: telegramChatId,
      photo: photoUrl,
    };
    if (options?.caption) body.caption = options.caption.slice(0, 1024);
    this.applyReplyMarkup(body, options);
    const result = await this.callBotApi<{ message_id?: number }>("sendPhoto", body);
    if (result?.message_id == null) {
      throw new Error("Telegram API: missing message_id in sendPhoto response");
    }
    return { messageId: result.message_id };
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.callBotApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text: text.slice(0, 200) } : {}),
    });
  }

  /** Resolve a Telegram file_id to a temporary Bot API file URL for CRM inbox. */
  async resolveFileUrl(fileId: string): Promise<string | null> {
    const token = await this.resolveBotToken();
    const file = await this.callBotApi<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file?.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  }

  private applyReplyMarkup(body: Record<string, unknown>, options?: SendMessageOptions): void {
    if (options?.requestContactButton) {
      body.reply_markup = {
        keyboard: [[{ text: "📱 Поділитися номером", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      };
      return;
    }
    const replyKeyboard =
      options?.menuKeyboard ??
      (options?.menuButtons?.length ? options.menuButtons.map((b) => [b]) : undefined);
    if (options?.inlineKeyboard?.length) {
      body.reply_markup = {
        inline_keyboard: options.inlineKeyboard,
      };
      // Also keep the persistent reply keyboard if provided (Telegram allows only one reply_markup).
      // Prefer inline for wizard steps; attach reply keyboard on plain menu replies instead.
      if (replyKeyboard?.length && !options.inlineKeyboard.length) {
        body.reply_markup = {
          keyboard: replyKeyboard.map((row) => row.map((text) => ({ text }))),
          resize_keyboard: true,
        };
      }
      return;
    }
    if (replyKeyboard?.length) {
      body.reply_markup = {
        keyboard: replyKeyboard.map((row) => row.map((text) => ({ text }))),
        resize_keyboard: true,
      };
    }
  }

  private async resolveBotToken(): Promise<string> {
    const secrets = await this.settings.getTelegramSecrets();
    const token = secrets.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new BadRequestException(
        "Telegram bot token is not set. Configure it in Settings → Telegram.",
      );
    }
    return token;
  }

  private async callBotApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const token = await this.resolveBotToken();
    const url = `https://api.telegram.org/bot${token}/${method}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
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
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API rejected ${method}: ${data.description ?? "unknown error"}`);
    }
    return data.result as T;
  }

  private async resolveWebhookUrl(): Promise<string> {
    const secrets = await this.settings.getTelegramSecrets();
    const baseUrl = (secrets.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "")
      .trim()
      .replace(/\/+$/, "");
    if (!baseUrl) {
      throw new BadRequestException(
        "Public base URL is not set. Configure it in Settings → Telegram.",
      );
    }
    return `${baseUrl}/integrations/telegram/webhook`;
  }

  /** Register the bot webhook at `{publicBaseUrl}/integrations/telegram/webhook` with the secret token. */
  async registerWebhook(): Promise<{ ok: true; url: string }> {
    const url = await this.resolveWebhookUrl();
    const secrets = await this.settings.getTelegramSecrets();
    const secretToken = secrets.webhookSecret ?? process.env.TELEGRAM_WEBHOOK_SECRET;
    await this.callBotApi<boolean>("setWebhook", {
      url,
      allowed_updates: ["message", "edited_message", "callback_query"],
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
    return { ok: true, url };
  }

  /** Fetch current webhook status from Telegram for diagnostics in Settings. */
  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    const result = await this.callBotApi<{
      url: string;
      has_custom_certificate: boolean;
      pending_update_count: number;
      ip_address?: string;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }>("getWebhookInfo");
    return {
      url: result.url,
      hasCustomCertificate: result.has_custom_certificate,
      pendingUpdateCount: result.pending_update_count,
      ipAddress: result.ip_address,
      lastErrorDate: result.last_error_date,
      lastErrorMessage: result.last_error_message,
      maxConnections: result.max_connections,
      allowedUpdates: result.allowed_updates,
    };
  }
}
