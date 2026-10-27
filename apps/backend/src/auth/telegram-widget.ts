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

/** Auth date must be recent. Ten minutes blocks replay of a captured widget payload. */
export function isTelegramAuthDateValid(authDate: number, maxAgeSeconds = 600): boolean {
  const now = Math.floor(Date.now() / 1000);
  return authDate > 0 && authDate <= now + 60 && now - authDate <= maxAgeSeconds;
}
