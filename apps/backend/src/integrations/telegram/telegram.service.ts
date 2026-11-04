import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ConversationChannel,
  ConversationStatus,
  LeadSource,
  LeadStatus,
  MessageDirection,
  Prisma,
  UserRole,
} from "@prisma/client";
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
  CLIENT_MENU_BUTTONS,
  CLIENT_MENU_KEYBOARD,
  CLIENT_START_KEYBOARD,
  MENU_START,
  buildClientMenuKeyboard,
  TELEGRAM_EXISTING_CLIENT,
  TELEGRAM_PRESS_START,
  TELEGRAM_REQUEST_PHONE,
} from "./telegram-client.constants";
import { ConversationsService } from "./conversations.service";
import { TelegramClientBotService } from "./telegram-client-bot.service";
import { TelegramInboxNotifierService } from "./telegram-inbox-notifier.service";
import { TelegramManagerBotService } from "./telegram-manager-bot.service";
import { appendCatalogHandoff } from "../../store/telegram/store-catalog-handoff";

function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** A duplicate delivery is treated as in-flight only this long. After that, retry the update. */
const INBOUND_RETRY_STALE_MS = 45 * 1000;
const TELEGRAM_TEXT_LIMIT = 4096;
const INBOUND_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const INBOUND_RETAIN_MS = 30 * 24 * 60 * 60 * 1000;

function clipTelegramText(text: string, limit = TELEGRAM_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function isPrivateTelegramChat(chatType: string | null, chatId: string): boolean {
  if (chatType) return chatType === "private";
  return !chatId.startsWith("-");
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private lastPruneAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly contactsService: ContactsService,
    private readonly phoneEntityLookup: PhoneEntityLookupService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
    private readonly inboxNotifier: TelegramInboxNotifierService,
    @Optional()
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations?: ConversationsService,
    @Optional()
    @Inject(forwardRef(() => TelegramClientBotService))
    private readonly clientBot?: TelegramClientBotService,
    @Optional()
    @Inject(forwardRef(() => TelegramManagerBotService))
    private readonly managerBot?: TelegramManagerBotService,
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
        chatTitle: typeof chat.title === "string" ? chat.title : null,
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
        isEdit: false,
        callbackQueryId: cb.id ?? null,
      };
    }

    const msg = update.message ?? update.edited_message;
    if (!msg?.chat?.id || !msg.from?.id) return null;
    const isEdit = !update.message && Boolean(update.edited_message);

    const from = msg.from;
    const chat = msg.chat;
    const media = this.extractMedia(msg);
    const caption = typeof msg.caption === "string" ? msg.caption : null;
    let text = typeof msg.text === "string" ? msg.text : caption;
    const phone = this.ownContactPhone(msg);
    if (msg.contact && !phone) {
      const label = [msg.contact.first_name, msg.contact.last_name, msg.contact.phone_number]
        .filter((part) => typeof part === "string" && part.trim())
        .join(" ");
      const note = label ? `[контакт: ${label}]` : "[контакт]";
      text = text ? `${text}\n${note}` : note;
    }
    const date = msg.date != null ? new Date(msg.date * 1000) : new Date();

    return {
      chatId: String(chat.id),
      chatType: chat.type ?? null,
      chatTitle: typeof chat.title === "string" ? chat.title : null,
      userId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      phone,
      messageId: msg.message_id,
      date,
      text,
      mediaType: media?.mediaType ?? null,
      fileId: media?.fileId ?? null,
      isCallback: false,
      isEdit,
      callbackQueryId: null,
    };
  }

  /**
   * A shared contact is identity only when Telegram says it belongs to the sender
   * (the "share my phone number" button sets contact.user_id = from.id).
   */
  private ownContactPhone(msg: TelegramMessage): string | null {
    const contact = msg.contact;
    if (!contact?.phone_number || msg.from?.id == null || contact.user_id == null) return null;
    if (String(contact.user_id) !== String(msg.from.id)) return null;
    const digits = normalizePhoneDigits(contact.phone_number);
    if (digits.length < 5) return null;
    return contact.phone_number;
  }

  /**
   * Handle incoming webhook update: upsert account, find/create conversation,
   * link contact/lead, create inbound message.
   */
  async handleInboundUpdate(update: TelegramUpdate): Promise<void> {
    if (!update || typeof update !== "object" || update.update_id == null) return;

    if (update.my_chat_member) {
      await this.handleMyChatMemberUpdate(update);
      return;
    }

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
      if (!existing || existing.processedAt) return;
      const ageMs = Date.now() - existing.createdAt.getTime();
      const failed = Boolean(existing.processingError);
      // A recent row without an error is the request that is still running.
      // 503 makes Telegram retry later instead of treating the update as delivered.
      if (!failed && ageMs < INBOUND_RETRY_STALE_MS) {
        throw new ServiceUnavailableException("Inbound update is still in progress");
      }
      inboundRecordId = existing.id;
    }

    let succeeded = false;
    try {
      if (!isPrivateTelegramChat(parsed.chatType, parsed.chatId)) {
        const staffGroupId = await this.getStaffGroupChatId();
        if (staffGroupId && parsed.chatId === staffGroupId) {
          await this.handleStaffGroupInbound(parsed);
        } else {
          await this.leaveChat(parsed.chatId);
        }
        succeeded = true;
        return;
      }

      if (parsed.isEdit) {
        await this.applyEditedMessage(parsed);
        succeeded = true;
        return;
      }

      // Staff quick-actions (mgr:claim / mgr:mute / mgr:inv / …) — before client conversation wiring.
      if (
        parsed.isCallback &&
        this.managerBot?.isManagerCallback(parsed.text) &&
        (await this.managerBot.handleCallback(parsed))
      ) {
        succeeded = true;
        return;
      }

      // Staff: /client, /docs, mgr_search text
      if (this.managerBot && (await this.managerBot.tryHandleStaffText(parsed))) {
        succeeded = true;
        return;
      }

      // CRM user link: /link TOKEN. Groups never reach this branch.
      const linkMatch = parsed.text?.match(/^\/link\s+(\S+)/);
      if (linkMatch) {
        try {
          const { email } = await this.authService.confirmTelegramLink(
            linkMatch[1],
            parsed.userId,
            parsed.chatId,
          );
          // Keep Telegram profile for naming; do not treat staff as a shop client.
          await this.upsertTelegramAccount({
            telegramUserId: parsed.userId,
            telegramChatId: parsed.chatId,
            username: parsed.username,
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            middleName: null,
            phone: parsed.phone,
            lastMessageAt: new Date(),
          });
          if (this.managerBot) {
            await this.managerBot.greetLinkedStaff(parsed.chatId, email);
          } else {
            await this.sendMessageToChat(
              parsed.chatId,
              `Telegram прив'язано до акаунта CRM (${email}).`,
            );
          }
        } catch {
          await this.sendMessageToChat(
            parsed.chatId,
            "Недійсне або прострочене посилання. Запитайте нове в налаштуваннях CRM (Налаштування → підключити Telegram).",
          );
        }
        succeeded = true;
        return;
      }

      // Linked staff: keep profile fresh; stay out of client shop unless «Магазин» mode.
      // Menu buttons / flows are handled earlier in tryHandleStaffText.
      const linkedStaff = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
          OR: [{ telegramUserId: parsed.userId }, { telegramChatId: parsed.chatId }],
        },
        select: { id: true, fullName: true, email: true },
      });
      if (linkedStaff) {
        await this.upsertTelegramAccount({
          telegramUserId: parsed.userId,
          telegramChatId: parsed.chatId,
          username: parsed.username,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          middleName: null,
          phone: parsed.phone,
          lastMessageAt: new Date(),
        });
        const inShop = this.managerBot
          ? await this.managerBot.isStaffShopMode(parsed.userId)
          : false;
        if (!inShop) {
          // Media / empty: tryHandleStaffText skipped — nudge the reply keyboard.
          if (!parsed.text?.trim() && !parsed.isCallback && this.managerBot) {
            await this.managerBot.nudgeStaffMenu(parsed.chatId);
          }
          succeeded = true;
          return;
        }
        // staffShopMode: fall through to the client shop / inbox pipeline.
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
      const startLower = trimmedText.toLowerCase();
      const isStartPlainCommand =
        startLower === "/start" ||
        /^\/start(?:@\w+)?(?:\s|$)/i.test(trimmedText);
      const isClientMenuAction = (CLIENT_MENU_BUTTONS as readonly string[]).includes(trimmedText);
      const isCommandMessage =
        isHelpCommand ||
        isStartPlainCommand ||
        trimmedText.startsWith("/") ||
        parsed.isCallback ||
        isClientMenuAction;

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
      /** Deep-link / phone / chat repair just attached CRM — allow one auto-assign pass. */
      let linkChangedThisTurn = false;
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
            linkChangedThisTurn = true;
          }
        }
      }

      let leadId: string | null = account.leadId;

      if (!contactId && !leadId) {
        const linkedChat = await this.prisma.conversation.findUnique({
          where: { telegramChatId: parsed.chatId },
          select: { contactId: true, leadId: true },
        });
        if (linkedChat?.contactId) {
          contactId = linkedChat.contactId;
          leadId = null;
          await this.prisma.telegramAccount.update({
            where: { id: account.id },
            data: { contactId, leadId: null },
          });
          linkChangedThisTurn = true;
        } else if (linkedChat?.leadId) {
          leadId = linkedChat.leadId;
          await this.prisma.telegramAccount.update({
            where: { id: account.id },
            data: { leadId },
          });
          linkChangedThisTurn = true;
        }
      }

      if (parsed.phone) {
        // Always resolve CRM contact by the shared phone — even if a lead/placeholder
        // was already linked. Role/region gap-fill must read THAT contact's fields.
        const digits =
          getPhoneNormalizedDigits(parsed.phone) ?? normalizePhoneDigits(parsed.phone);
        const candidates = digits ? getPhoneCandidatesForLookup(digits) : [];

        let phoneContactId: string | null = null;
        for (const c of candidates) {
          const row = await this.contactsService.findContactByPhone(c);
          if (row) {
            phoneContactId = row.id;
            break;
          }
        }

        if (phoneContactId) {
          const phoneLinkChanged =
            phoneContactId !== account.contactId || account.leadId != null;
          contactId = phoneContactId;
          leadId = null;
          await this.prisma.telegramAccount.update({
            where: { id: account.id },
            data: { contactId, leadId: null },
          });
          shouldSendExistingClientMenu = true;
          if (phoneLinkChanged) linkChangedThisTurn = true;
        } else if (!contactId && !leadId) {
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
      }

      if (!contactId && !leadId) {
        if (!parsed.phone && !isCommandMessage && !account.phone) {
          // Beginning of dialog: ask to press Старт (not the working commerce menu).
          if (trimmedText === MENU_START) {
            /* handled by client bot replyStart */
          } else {
            await this.sendMessageToChat(parsed.chatId, TELEGRAM_PRESS_START, {
              menuKeyboard: CLIENT_START_KEYBOARD,
            });
            botReplySent = true;
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

      // Auto-assign on first create or when contact/lead is newly linked — not on every
      // inbound (manual «Зняти» must stick until someone claims the pool again).
      let shouldAutoAssign = false;
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
        shouldAutoAssign = true;
      } else {
        const prevContactId = conversation.contactId;
        const prevLeadId = conversation.leadId;
        // Phone→contact sets leadId=null locally; do not coalesce back to the old lead.
        const nextContactId = contactId ?? conversation.contactId;
        const nextLeadId = contactId != null ? leadId : (leadId ?? conversation.leadId);

        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            contactId: nextContactId,
            leadId: nextLeadId,
            lastMessageAt: now,
            ...(reopen && !parsed.isCallback ? { status: ConversationStatus.OPEN } : {}),
          },
        });

        const newlyLinked =
          (contactId != null && contactId !== prevContactId) ||
          (leadId != null && leadId !== prevLeadId);
        shouldAutoAssign = newlyLinked || linkChangedThisTurn;
      }

      if (shouldAutoAssign && this.conversations) {
        try {
          await this.conversations.autoAssignByRegion(conversation.id);
        } catch (err) {
          this.logger.warn(
            `autoAssignByRegion: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Callbacks are UX-only: do not pollute the transcript with callback_data.
      // file_id only. The bot token must not be stored in Message.fileUrl.
      if (!parsed.isCallback) {
        try {
          await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              direction: MessageDirection.INBOUND,
              text: parsed.text ?? this.mediaPlaceholderText(parsed.mediaType),
              mediaType: parsed.mediaType,
              fileId: parsed.fileId,
              fileUrl: null,
              tgMessageId: String(parsed.messageId),
              sentAt: parsed.date,
            },
          });
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) throw error;
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
            menuKeyboard: await this.clientBot.catalogMenuKeyboard(parsed.userId),
          });
          notifyManager = false;
        }
      } else if (shouldSendExistingClientMenu && !botReplySent) {
        await this.sendMessageToChat(parsed.chatId, TELEGRAM_EXISTING_CLIENT, {
          menuKeyboard: await this.clientMenuKeyboard(parsed.userId),
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

      succeeded = true;
    } catch (error) {
      // Keep the idempotency row. A later delivery of the same update_id retries
      // once processingError is set or the in-flight window has passed.
      await this.prisma.telegramInboundUpdate
        .update({
          where: { id: inboundRecordId },
          data: {
            processingError: this.safeErrorText(error),
          },
        })
        .catch(() => {});
      throw error;
    } finally {
      if (succeeded) {
        await this.prisma.telegramInboundUpdate
          .update({
            where: { id: inboundRecordId },
            data: { processedAt: new Date(), processingError: null },
          })
          .catch(() => {});
        void this.maybePruneInbound();
      }
    }
  }

  private async applyEditedMessage(parsed: ParsedInbound): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { telegramChatId: parsed.chatId },
      select: { id: true },
    });
    if (!conversation) return;
    await this.prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        tgMessageId: String(parsed.messageId),
      },
      data: { text: parsed.text ?? this.mediaPlaceholderText(parsed.mediaType) },
    });
  }

  /** Drop the bot from a group or channel. Identity and orders stay in the private chat. */
  async leaveChat(chatId: string): Promise<void> {
    try {
      await this.callBotApi<boolean>("leaveChat", { chat_id: chatId });
    } catch (error) {
      this.logger.warn(`leaveChat failed for ${chatId}: ${this.safeErrorText(error)}`);
    }
  }

  async getStaffGroupChatId(): Promise<string | null> {
    try {
      const secrets = await this.settings.getTelegramSecrets();
      const id = secrets.staffGroupChatId?.trim() || null;
      return id || null;
    } catch {
      return null;
    }
  }

  /**
   * Internal staff group: keep messages in CRM Inbox, allow mgr callbacks,
   * never run the client shop FSM. Skip inbox push alerts (managers already see the group).
   */
  private async handleStaffGroupInbound(parsed: ParsedInbound): Promise<void> {
    if (
      parsed.isCallback &&
      this.managerBot?.isManagerCallback(parsed.text) &&
      (await this.managerBot.handleCallback(parsed))
    ) {
      return;
    }

    if (parsed.isEdit) {
      await this.applyEditedMessage(parsed);
      return;
    }

    if (parsed.isCallback) return;

    const now = new Date();
    const title = parsed.chatTitle?.trim() || null;
    // Persist group title via a synthetic TelegramAccount so Inbox labels stay stable.
    await this.upsertTelegramAccount({
      telegramUserId: `group:${parsed.chatId}`,
      telegramChatId: parsed.chatId,
      username: null,
      firstName: title,
      lastName: null,
      middleName: null,
      phone: null,
      lastMessageAt: now,
    });

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
          status: ConversationStatus.OPEN,
          lastMessageAt: now,
        },
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          ...(reopen ? { status: ConversationStatus.OPEN } : {}),
        },
      });
    }

    const authorUser = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        telegramUserId: parsed.userId,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
      },
      select: { id: true, fullName: true },
    });
    const authorLabel =
      authorUser?.fullName?.trim() ||
      [parsed.firstName, parsed.lastName].filter(Boolean).join(" ").trim() ||
      (parsed.username ? `@${parsed.username}` : null) ||
      `tg:${parsed.userId}`;
    const body = parsed.text ?? this.mediaPlaceholderText(parsed.mediaType);
    const text = body ? `[${authorLabel}]: ${body}` : `[${authorLabel}]`;

    try {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          text,
          mediaType: parsed.mediaType,
          fileId: parsed.fileId,
          fileUrl: null,
          tgMessageId: String(parsed.messageId),
          sentAt: parsed.date,
          authorUserId: authorUser?.id ?? null,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
    }
  }

  private async handleMyChatMemberUpdate(update: TelegramUpdate): Promise<void> {
    const event = update.my_chat_member;
    if (!event?.chat?.id) return;
    const updateId = String(update.update_id);
    const chatId = String(event.chat.id);
    const chatType = event.chat.type ?? null;

    try {
      await this.prisma.telegramInboundUpdate.create({
        data: { updateId, telegramChatId: chatId },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) return;
      throw error;
    }

    let succeeded = false;
    try {
      const newStatus = event.new_chat_member?.status ?? "";
      const joined = newStatus === "member" || newStatus === "administrator";
      const left = newStatus === "left" || newStatus === "kicked";
      const staffGroupId = await this.getStaffGroupChatId();
      const isStaffGroup = Boolean(staffGroupId && chatId === staffGroupId);

      if (joined && !isPrivateTelegramChat(chatType, chatId) && !isStaffGroup) {
        this.logger.log(`Leaving non-staff group ${chatId} after bot was added`);
        await this.leaveChat(chatId);
      } else if (joined && isStaffGroup) {
        this.logger.log(`Bot joined configured staff group ${chatId}`);
        const title = typeof event.chat.title === "string" ? event.chat.title : null;
        if (title) {
          await this.upsertTelegramAccount({
            telegramUserId: `group:${chatId}`,
            telegramChatId: chatId,
            username: null,
            firstName: title,
            lastName: null,
            middleName: null,
            phone: null,
            lastMessageAt: new Date(),
          });
        }
      } else if (left && isStaffGroup) {
        this.logger.warn(`Bot removed from staff group ${chatId}`);
      }

      succeeded = true;
      await this.prisma.telegramInboundUpdate.update({
        where: { updateId },
        data: { processedAt: new Date(), processingError: null },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.prisma.telegramInboundUpdate
        .update({
          where: { updateId },
          data: { processingError: msg.slice(0, 500) },
        })
        .catch(() => {});
      if (!succeeded) throw error;
    }
  }

  private safeErrorText(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]").slice(0, 500);
  }

  private async maybePruneInbound(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPruneAt < INBOUND_PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = now;
    const cutoff = new Date(now - INBOUND_RETAIN_MS);
    await this.prisma.telegramInboundUpdate
      .deleteMany({ where: { processedAt: { not: null, lt: cutoff } } })
      .catch(() => {});
    const logs = this.prisma.telegramClientNotifyLog;
    if (logs) {
      await logs.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
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
      if (byChat.telegramUserId !== params.telegramUserId) {
        this.logger.warn(
          `Refusing to reassign telegram chat ${params.telegramChatId} from user ${byChat.telegramUserId} to ${params.telegramUserId}`,
        );
        throw error;
      }

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
      text: clipTelegramText(text),
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

  /**
   * Upload a PDF (or other file) to a chat via multipart sendDocument.
   * JSON callBotApi cannot attach binary payloads.
   */
  async sendDocumentToChat(
    telegramChatId: string,
    file: Buffer,
    filename: string,
    options?: { caption?: string },
  ): Promise<{ messageId: number }> {
    const token = await this.resolveBotToken();
    const form = new FormData();
    form.append("chat_id", telegramChatId);
    const safeName = (filename || "document.pdf").replace(/[^\w.\-а-яА-ЯіїєґІЇЄҐ]+/g, "_");
    form.append(
      "document",
      new Blob([Uint8Array.from(file)], { type: "application/pdf" }),
      safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`,
    );
    if (options?.caption?.trim()) {
      form.append("caption", options.caption.trim().slice(0, 1024));
    }

    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Telegram sendDocument failed: ${msg}`);
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram sendDocument error ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as {
      ok: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (!data.ok || data.result?.message_id == null) {
      throw new Error(`Telegram sendDocument rejected: ${data.description ?? "unknown error"}`);
    }
    return { messageId: data.result.message_id };
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.callBotApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text: text.slice(0, 200) } : {}),
    });
  }

  /**
   * Fetch a Telegram file without exposing the bot token. Callers stream the bytes
   * through an authenticated CRM route.
   */
  async downloadFile(fileId: string): Promise<{ contentType: string; body: Buffer }> {
    const token = await this.resolveBotToken();
    const file = await this.callBotApi<{ file_path?: string }>("getFile", { file_id: fileId });
    const filePath = file?.file_path;
    if (!filePath || filePath.includes("..") || filePath.startsWith("/") || filePath.includes("://")) {
      throw new NotFoundException("File not found");
    }
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      this.logger.warn(`telegram file download failed: ${this.safeErrorText(error)}`);
      throw new NotFoundException("File unavailable");
    }
    if (!res.ok) throw new NotFoundException("File unavailable");
    return {
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      body: Buffer.from(await res.arrayBuffer()),
    };
  }

  /** @deprecated Token-bearing Bot API URLs must not leave the server. Use downloadFile. */
  async resolveFileUrl(fileId: string): Promise<string | null> {
    void fileId;
    return null;
  }

  private async clientMenuKeyboard(telegramUserId?: string) {
    try {
      const config = await this.settings.getStoreConfig();
      const url = (config.publicStoreUrl ?? "").trim().replace(/\/+$/, "");
      if (/^https:\/\//i.test(url)) {
        const signed = telegramUserId ? await this.catalogUrlWithPhone(url, telegramUserId) : url;
        return buildClientMenuKeyboard(signed);
      }
    } catch {
      /* fall through */
    }
    return CLIENT_MENU_KEYBOARD;
  }

  /** Same handoff the client bot puts on «Каталог», for the rare path without that bot. */
  private async catalogUrlWithPhone(storeUrl: string, telegramUserId: string): Promise<string> {
    const account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId },
      select: { phone: true, contactId: true, firstName: true, lastName: true },
    });
    let phone = account?.phone?.trim() || null;
    let firstName = account?.firstName ?? null;
    let lastName = account?.lastName ?? null;
    if ((!phone || phone.replace(/\D/g, "").startsWith("0000")) && account?.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: account.contactId },
        select: { phone: true, firstName: true, lastName: true },
      });
      phone = contact?.phone?.trim() || null;
      firstName = contact?.firstName?.trim() || firstName;
      lastName = contact?.lastName?.trim() || lastName;
    }
    if (!phone || phone.replace(/\D/g, "").length < 10) return storeUrl;
    return appendCatalogHandoff(storeUrl, {
      telegramUserId,
      phone,
      contactId: account?.contactId,
      firstName,
      lastName,
    });
  }

  private mapMenuButton(button: string | { text: string; webAppUrl?: string; requestContact?: boolean }) {
    if (typeof button === "string") return { text: button };
    const cell: Record<string, unknown> = { text: button.text };
    if (button.webAppUrl) cell.web_app = { url: button.webAppUrl };
    if (button.requestContact) cell.request_contact = true;
    return cell;
  }

  private applyReplyMarkup(body: Record<string, unknown>, options?: SendMessageOptions): void {
    if (options?.requestContactButton) {
      const extra =
        options.menuKeyboard?.map((row) => row.map((button) => this.mapMenuButton(button))) ?? [];
      body.reply_markup = {
        keyboard: [[{ text: "📱 Поділитися номером", request_contact: true }], ...extra],
        resize_keyboard: true,
        is_persistent: true,
      };
      return;
    }
    if (options?.inlineKeyboard?.length) {
      // Telegram allows only one reply_markup; inline wins for wizard steps.
      body.reply_markup = {
        inline_keyboard: options.inlineKeyboard,
      };
      return;
    }
    if (options?.removeKeyboard) {
      body.reply_markup = { remove_keyboard: true };
      return;
    }
    const replyKeyboard =
      options?.menuKeyboard ??
      (options?.menuButtons?.length ? options.menuButtons.map((b) => [b]) : undefined);
    if (replyKeyboard?.length) {
      body.reply_markup = {
        keyboard: replyKeyboard.map((row) => row.map((button) => this.mapMenuButton(button))),
        resize_keyboard: true,
        is_persistent: true,
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
      allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member"],
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
