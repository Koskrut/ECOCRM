import { MessageDirection, type Prisma } from "@prisma/client";

/** Bot/system command prefixes treated as noise when they are the only inbound activity. */
export const NOISE_COMMAND_PREFIXES = [
  "/start",
  "/help",
  "/link",
  "/menu",
  "/catalog",
  "/cart",
  "/orders",
  "/cancel",
  "/docs",
  "/client",
  "/find",
] as const;

/** Reply-keyboard labels the client bot records as inbound text. */
export const TELEGRAM_MENU_LABELS = [
  "🛍 Каталог",
  "🛒 Кошик",
  "📦 Замовлення",
  "💬 Менеджер",
  "🏠 Старт",
  "👤 Клієнт",
  "📄 За номером",
  "🏠 Меню",
  "✖️ Скасувати",
] as const;

export const TELEGRAM_CALLBACK_PREFIXES = ["cat:", "cart:", "ord:", "chk:"] as const;

export type InboxNoiseMessage = {
  direction: string;
  text: string | null;
  authorUserId?: string | null;
  mediaType?: string | null;
};

export function isNoiseCommandText(text: string | null | undefined): boolean {
  if (text == null) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return true;
  const first = trimmed.split(/\s+/)[0] ?? "";
  return NOISE_COMMAND_PREFIXES.some(
    (prefix) => first === prefix || first.startsWith(`${prefix}@`),
  );
}

/**
 * Inbound text the Telegram client bot would not notify a manager about:
 * slash commands, menu labels, and cat:/cart:/ord:/chk: payloads. Blank text is noise.
 * Media placeholders such as "[фото]" are not noise.
 */
export function isTelegramInboxNoiseText(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return true;
  if (isNoiseCommandText(trimmed)) return true;
  if ((TELEGRAM_MENU_LABELS as readonly string[]).includes(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return TELEGRAM_CALLBACK_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** Last human message: not an internal note, not a bot/system outbound, not menu UX. */
export function isHumanInboxMessage(message: InboxNoiseMessage): boolean {
  if (message.direction === MessageDirection.INTERNAL) return false;
  if (message.direction === MessageDirection.OUTBOUND) return Boolean(message.authorUserId);
  if (message.direction !== MessageDirection.INBOUND) return false;
  if (message.mediaType) return true;
  return !isTelegramInboxNoiseText(message.text);
}

export function isNoiseConversation(
  messages: InboxNoiseMessage[],
  opts?: { telegram?: boolean },
): boolean {
  if (messages.length === 0) return true;
  const telegram = opts?.telegram === true;
  if (messages.some((m) => m.direction === MessageDirection.INTERNAL)) return false;
  if (
    messages.some(
      (m) =>
        m.direction === MessageDirection.OUTBOUND && (!telegram || Boolean(m.authorUserId)),
    )
  ) {
    return false;
  }
  const inbounds = messages.filter((m) => m.direction === MessageDirection.INBOUND);
  if (inbounds.length === 0) return true;
  if (!telegram) return inbounds.every((m) => isNoiseCommandText(m.text));
  return inbounds.every((m) => !m.mediaType && isTelegramInboxNoiseText(m.text));
}

function commandNoiseNots(prefix: string): Prisma.MessageWhereInput[] {
  return [
    { NOT: { text: { equals: prefix, mode: "insensitive" } } },
    { NOT: { text: { startsWith: `${prefix} `, mode: "insensitive" } } },
    { NOT: { text: { startsWith: `${prefix}@`, mode: "insensitive" } } },
  ];
}

/**
 * Meta-safe hide-noise: any outbound (including authorUserId null) keeps the thread.
 * Instagram/Facebook replies must not disappear if a system send has no CRM author.
 */
export function hideNoiseWhere(): Prisma.ConversationWhereInput {
  return {
    OR: [
      { messages: { some: { direction: MessageDirection.OUTBOUND } } },
      { messages: { some: { direction: MessageDirection.INTERNAL } } },
      {
        messages: {
          some: {
            direction: MessageDirection.INBOUND,
            AND: NOISE_COMMAND_PREFIXES.map((prefix) => ({
              NOT: { text: { startsWith: prefix } },
            })),
          },
        },
      },
    ],
  };
}

/**
 * Telegram hide-noise. Bot menu replies are outbound with authorUserId null and must
 * not keep a thread. A manager reply, an internal note, or a real client inbound does.
 */
export function telegramHideNoiseWhere(): Prisma.ConversationWhereInput {
  const noiseNots: Prisma.MessageWhereInput[] = [
    ...NOISE_COMMAND_PREFIXES.flatMap((prefix) => commandNoiseNots(prefix)),
    ...TELEGRAM_MENU_LABELS.map((label) => ({ NOT: { text: { equals: label } } })),
    ...TELEGRAM_CALLBACK_PREFIXES.flatMap((prefix) => [
      { NOT: { text: { startsWith: prefix, mode: "insensitive" as const } } },
    ]),
  ];

  return {
    OR: [
      { messages: { some: { direction: MessageDirection.INTERNAL } } },
      {
        messages: {
          some: {
            direction: MessageDirection.OUTBOUND,
            authorUserId: { not: null },
          },
        },
      },
      {
        messages: {
          some: {
            direction: MessageDirection.INBOUND,
            OR: [
              { mediaType: { not: null } },
              {
                AND: [{ text: { not: null } }, { NOT: { text: "" } }, ...noiseNots],
              },
            ],
          },
        },
      },
    ],
  };
}

export function countUnreadInbound(
  messages: Array<{ direction: string; sentAt: Date }>,
  lastReadAt: Date | null,
): number {
  return messages.filter((m) => {
    if (m.direction !== MessageDirection.INBOUND) return false;
    if (!lastReadAt) return true;
    return m.sentAt > lastReadAt;
  }).length;
}

export const conversationListOrderBy: Prisma.ConversationOrderByWithRelationInput[] = [
  { pinnedAt: { sort: "desc", nulls: "last" } },
  { lastMessageAt: { sort: "desc", nulls: "last" } },
];
