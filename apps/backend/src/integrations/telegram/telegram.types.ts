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

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  contact?: TelegramContact;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: unknown;
};

export type ParsedInbound = {
  chatId: string;
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  messageId: number;
  date: Date;
  text: string | null;
};
