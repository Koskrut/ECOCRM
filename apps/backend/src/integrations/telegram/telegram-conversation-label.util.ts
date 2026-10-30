/** Placeholder names we create before a real CRM profile exists. */
const PLACEHOLDER_TOKENS = new Set(["telegram", "user", "unknown", "гість", "гость"]);

export type TelegramPeerBrief = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

export type StaffUserBrief = {
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
};

export type ConversationLabelInput = {
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    documentDisplayName?: string | null;
  } | null;
  lead?: {
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null;
  peer?: TelegramPeerBrief | null;
  staffUser?: StaffUserBrief | null;
  telegramChatId?: string | null;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isPlaceholderToken(value: string): boolean {
  return PLACEHOLDER_TOKENS.has(value.trim().toLowerCase());
}

export function isPlaceholderPersonName(
  firstName?: string | null,
  lastName?: string | null,
): boolean {
  const first = clean(firstName);
  const last = clean(lastName);
  if (!first && !last) return true;
  const parts = [first, last].filter(Boolean);
  return parts.length > 0 && parts.every(isPlaceholderToken);
}

/** CRM style: «Прізвище Ім'я». */
export function formatUaPersonName(
  lastName?: string | null,
  firstName?: string | null,
): string {
  return [clean(lastName), clean(firstName)].filter(Boolean).join(" ");
}

export function formatTelegramPeerLabel(
  peer?: TelegramPeerBrief | null,
  telegramChatId?: string | null,
): string {
  const first = clean(peer?.firstName);
  const last = clean(peer?.lastName);
  const username = clean(peer?.username).replace(/^@/, "");
  const nameParts = [first, last].filter((p) => p && !isPlaceholderToken(p));
  const name = nameParts.join(" ");
  if (name && username) return `${name} · @${username}`;
  if (name) return name;
  if (username) return `@${username}`;
  const chatId = clean(telegramChatId);
  if (chatId) return `Telegram · ${chatId}`;
  return "Telegram";
}

function withPhone(label: string, phone?: string | null): string {
  const p = clean(phone);
  if (!p) return label;
  if (label.includes(p)) return label;
  return `${label} · ${p}`;
}

/**
 * Human-readable Inbox / notification title.
 * Priority: staff → CRM contact → lead → Telegram profile → chat id.
 */
export function formatTelegramConversationLabel(input: ConversationLabelInput): string {
  if (input.staffUser) {
    const name = clean(input.staffUser.fullName) || clean(input.staffUser.email) || "менеджер";
    return `Співробітник · ${name}`;
  }

  const contact = input.contact;
  if (contact) {
    const doc = clean(contact.documentDisplayName);
    const person = formatUaPersonName(contact.lastName, contact.firstName);
    if (doc) return withPhone(doc, contact.phone);
    if (person && !isPlaceholderPersonName(contact.firstName, contact.lastName)) {
      return withPhone(person, contact.phone);
    }
    const peer = formatTelegramPeerLabel(input.peer, input.telegramChatId);
    if (peer && peer !== "Telegram") return withPhone(peer, contact.phone);
    if (clean(contact.phone)) return clean(contact.phone);
  }

  const lead = input.lead;
  if (lead) {
    const full = clean(lead.fullName);
    const person = formatUaPersonName(lead.lastName, lead.firstName);
    const base =
      (full && !isPlaceholderPersonName(full, null) ? full : "") ||
      (person && !isPlaceholderPersonName(lead.firstName, lead.lastName) ? person : "");
    if (base) return withPhone(base, lead.phone);
    const peer = formatTelegramPeerLabel(input.peer, input.telegramChatId);
    if (peer && peer !== "Telegram") return withPhone(`Лід · ${peer}`, lead.phone);
    if (clean(lead.phone)) return `Лід · ${clean(lead.phone)}`;
    return "Лід";
  }

  return formatTelegramPeerLabel(input.peer, input.telegramChatId);
}
