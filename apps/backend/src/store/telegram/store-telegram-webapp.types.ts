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
  /** Mini App cart/checkout JWT (aud store_tg). */
  token: string;
  /** Store cabinet JWT (aud store). Set as store_token cookie. */
  storeToken: string | null;
  cartSessionId: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  contactId: string | null;
  customerId: string | null;
  loggedIn: boolean;
};
