import { MessageDirection, type Prisma } from "@prisma/client";

/** Bot/system command prefixes treated as noise when they are the only inbound activity. */
export const NOISE_COMMAND_PREFIXES = ["/start", "/help", "/link"] as const;

export function isNoiseCommandText(text: string | null | undefined): boolean {
  if (text == null) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return true;
  const first = trimmed.split(/\s+/)[0] ?? "";
  return NOISE_COMMAND_PREFIXES.some(
    (prefix) => first === prefix || first.startsWith(`${prefix}@`),
  );
}

export function isNoiseConversation(
  messages: Array<{ direction: string; text: string | null }>,
): boolean {
  if (messages.length === 0) return true;
  if (messages.some((m) => m.direction === MessageDirection.OUTBOUND)) return false;
  if (messages.some((m) => m.direction === MessageDirection.INTERNAL)) return false;
  const inbounds = messages.filter((m) => m.direction === MessageDirection.INBOUND);
  if (inbounds.length === 0) return true;
  return inbounds.every((m) => isNoiseCommandText(m.text));
}

/**
 * Prisma where-fragment: keep conversations that have outbound, internal notes,
 * or at least one inbound that is not a known bot command.
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
