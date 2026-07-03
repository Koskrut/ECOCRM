/**
 * Minimal types for Telegram Bot API Update (webhook payload).
 * @see https://core.telegram.org/bots/api#update
 */

export type TelegramChat = {
  id: number;
  type?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
};

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramContact = {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  user_id?: number;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
};

export type TelegramFile = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  contact?: TelegramContact;
  photo?: TelegramPhotoSize[];
  document?: TelegramFile;
  voice?: TelegramFile;
  audio?: TelegramFile;
  video?: TelegramFile;
  video_note?: TelegramFile;
  sticker?: TelegramFile;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

/** Media kind persisted on Message.mediaType for inbound non-text content. */
export type TelegramMediaType =
  | "photo"
  | "document"
  | "voice"
  | "audio"
  | "video"
  | "video_note"
  | "sticker";

/** Subset of Telegram `getWebhookInfo` result surfaced in Settings. */
export type TelegramWebhookInfo = {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  ipAddress?: string;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
};

export type ParsedInbound = {
  chatId: string;
  chatType: string | null;
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  messageId: number;
  date: Date;
  text: string | null;
  mediaType: TelegramMediaType | null;
  fileId: string | null;
  /** True when the inbound came from an inline keyboard callback rather than a message. */
  isCallback: boolean;
};
