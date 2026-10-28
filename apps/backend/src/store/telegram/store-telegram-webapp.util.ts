import type { Request } from "express";
import { verifyJwt } from "../../auth/jwt";
import type { StoreTelegramWebAppJwtPayload } from "./store-telegram-webapp.types";

export type RequestWithStoreTg = Request & {
  storeTg?: StoreTelegramWebAppJwtPayload;
  customer?: { customerId: string; contactId: string };
};

/** Read an optional Mini App JWT from Authorization. Does not throw when missing. */
export function readStoreTelegramWebAppJwt(
  req: Request,
): StoreTelegramWebAppJwtPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const payload = verifyJwt<StoreTelegramWebAppJwtPayload>(token, secret);
    if (payload.aud !== "store_tg" || !payload.sub || !payload.cartSessionId) return null;
    if (!payload.cartSessionId.startsWith("tg:")) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isTelegramCartSessionId(sessionId: string | undefined | null): boolean {
  return Boolean(sessionId && sessionId.startsWith("tg:"));
}
