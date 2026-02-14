// src/auth/password.ts
import crypto from "node:crypto";

/**
 * Форматы passwordHash:
 * - plain:<password>           (legacy/dev-only)
 * - scrypt:<N>:<r>:<p>:<saltB64>:<hashB64>  (secure default, built-in)
 */

const DEFAULT_SCRYPT = {
  N: 16384, // CPU/memory cost
  r: 8,
  p: 1,
  keyLen: 32,
};

function timingSafeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashPassword(password: string): string {
  if (!password) return "";

  const salt = crypto.randomBytes(16);
  const { N, r, p, keyLen } = DEFAULT_SCRYPT;

  const derivedKey = crypto.scryptSync(password, salt, keyLen, { N, r, p });

  return [
    "scrypt",
    String(N),
    String(r),
    String(p),
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join(":");
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  if (!passwordHash) return false;

  // legacy/dev
  if (passwordHash.startsWith("plain:")) {
    const plain = passwordHash.slice("plain:".length);
    return plain === password;
  }

  // secure default
  if (passwordHash.startsWith("scrypt:")) {
    const parts = passwordHash.split(":");
    // scrypt:N:r:p:saltB64:hashB64
    if (parts.length !== 6) return false;

    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;

    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);

    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = crypto.scryptSync(password, salt, expected.length, { N, r, p });

    return timingSafeEqual(derived, expected);
  }

  // неизвестный формат
  return false;
}

/**
 * Нужно ли апгрейдить формат хеша после успешной проверки пароля.
 * Сейчас апгрейдим только plain -> scrypt.
 */
export function needsRehash(passwordHash: string): boolean {
  return !!passwordHash && passwordHash.startsWith("plain:");
}
