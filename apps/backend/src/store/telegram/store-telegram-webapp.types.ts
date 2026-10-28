export type StoreTelegramWebAppJwtPayload = {
  aud: "store_tg";
  /** Telegram user id as string. */
  sub: string;
  cartSessionId: string;
  chatId: string;
  phone?: string | null;
  contactId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type StoreTelegramWebAppSession = {
  token: string;
  cartSessionId: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  contactId: string | null;
};
