import { createHmac, timingSafeEqual } from "crypto";

const base64UrlEncode = (input: string): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const base64UrlDecode = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
};

const signData = (data: string, secret: string): string =>
  createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export const signJwt = (
  payload: Record<string, unknown>,
  secret: string,
  options?: { expiresInSeconds?: number },
): string => {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    ...(options?.expiresInSeconds
      ? { exp: now + options.expiresInSeconds }
      : {}),
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(body));
  const signature = signData(`${headerPart}.${payloadPart}`, secret);

  return `${headerPart}.${payloadPart}.${signature}`;
};

export const verifyJwt = <T>(token: string, secret: string): T => {
  const [headerPart, payloadPart, signature] = token.split(".");
  if (!headerPart || !payloadPart || !signature) {
    throw new Error("Invalid token format");
  }

  const expectedSignature = signData(`${headerPart}.${payloadPart}`, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart)) as T & {
    exp?: number;
  };

  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
};
