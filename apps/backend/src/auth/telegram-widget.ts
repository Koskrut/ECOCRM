import { createHmac, createHash, timingSafeEqual } from "crypto";

/**
 * Verify Telegram Login Widget data per https://core.telegram.org/widgets/login
 * data_check_string = keys (except hash) sorted alphabetically, key=value joined by \n
 * secret_key = SHA256(bot_token)
 * hash = hex(HMAC_SHA256(secret_key, data_check_string))
 */
export function verifyTelegramLoginHash(
  data: { hash: string; auth_date?: number; [k: string]: unknown },
  botToken: string,
): boolean {
  const { hash: receivedHash, ...rest } = data;
  if (!receivedHash || typeof receivedHash !== "string") return false;

  const dataCheckString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const left = Buffer.from(computedHash);
  const right = Buffer.from(receivedHash);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify Telegram Mini App initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * secret_key = HMAC_SHA256(bot_token, "WebAppData")
 * hash = hex(HMAC_SHA256(secret_key, data_check_string))
 */
export function verifyTelegramWebAppInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return false;

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secretKey = createHmac("sha256", botToken).update("WebAppData").digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const left = Buffer.from(computedHash);
  const right = Buffer.from(receivedHash);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type ParsedTelegramWebAppInitData = {
  authDate: number;
  user: TelegramWebAppUser | null;
  queryId: string | null;
  chatInstance: string | null;
};

/** Parse initData after signature verification. */
export function parseTelegramWebAppInitData(initData: string): ParsedTelegramWebAppInitData | null {
  const params = new URLSearchParams(initData);
  const authRaw = params.get("auth_date");
  const authDate = authRaw ? Number(authRaw) : NaN;
  if (!Number.isFinite(authDate) || authDate <= 0) return null;

  let user: TelegramWebAppUser | null = null;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw) as TelegramWebAppUser;
      if (parsed && typeof parsed.id === "number") user = parsed;
    } catch {
      return null;
    }
  }

  return {
    authDate,
    user,
    queryId: params.get("query_id"),
    chatInstance: params.get("chat_instance"),
  };
}

/** Auth date must be recent. Ten minutes blocks replay of a captured widget payload. */
export function isTelegramAuthDateValid(authDate: number, maxAgeSeconds = 600): boolean {
  const now = Math.floor(Date.now() / 1000);
  return authDate > 0 && authDate <= now + 60 && now - authDate <= maxAgeSeconds;
}
