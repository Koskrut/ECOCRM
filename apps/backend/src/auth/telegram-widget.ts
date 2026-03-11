import { createHmac, createHash } from "crypto";

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
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return computedHash === receivedHash;
}

/** Auth date must be within last 24h to prevent replay */
export function isTelegramAuthDateValid(authDate: number, maxAgeSeconds = 86400): boolean {
  const now = Math.floor(Date.now() / 1000);
  return authDate > 0 && now - authDate <= maxAgeSeconds;
}
