/**
 * Deeplink / payload для оплати за реквізитами згідно з правилами НБУ про QR для переказів
 * (див. https://bank.gov.ua/en/payments/use-qr та постанову про єдиний формат).
 * Рядок перед кодуванням збігається з форматом, що використовує офіційний хост
 * `https://bank.gov.ua/qr/{base64url}` (аналогічно до відкритих реалізацій UCT).
 */
export const NBU_QR_URL_BASE = "https://bank.gov.ua/qr";

export type NbuQrPaymentInput = {
  /** Найменування отримувача (1–70). */
  recipientName: string;
  /** IBAN (UA…), без пробілів. */
  iban: string;
  /** Код отримувача: ЄДРПОУ (8 цифр) або РНОКПП (10 цифр). */
  receiverCode: string;
  /** ISO 4217, напр. UAH. */
  currency: string;
  /** Сума у валюті (напр. 100.50). */
  amount: number;
  /** Призначення платежу (10–140 символів після нормалізації). */
  purpose: string;
  /** Текст для дисплею (до 70), може бути порожнім. */
  displayText?: string;
};

function normalizeReceiverCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (digits.length === 8 || digits.length === 10) return digits;
  throw new Error("receiverCode must be 8 (EDRPOU) or 10 (IPN) digits");
}

/** Нормалізує призначення до 10–140 символів (НБУ). */
export function normalizePurpose(purpose: string): string {
  const t = purpose.trim();
  if (t.length > 140) return t.slice(0, 140);
  if (t.length >= 10) return t;
  return t.padEnd(10, " ");
}

function formatAmountLine(currency: string, amount: number): string {
  const c = currency.trim().toUpperCase().slice(0, 3);
  if (c.length !== 3) throw new Error("currency must be ISO 4217 (3 letters)");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be positive");

  const cents = Math.round(amount * 100);
  if (cents < 1 || cents > 99999999999) throw new Error("amount out of range");

  const main = Math.floor(cents / 100);
  const kop = cents - main * 100;
  const amountPart = kop > 0 ? `${main}.${String(kop).padStart(2, "0")}` : String(main);
  return `${c}${amountPart}`;
}

/** Багаторядковий payload (UTF-8) перед base64 — для тестів і для QR. */
export function buildNbuQrPayloadLines(input: NbuQrPaymentInput): string {
  const receiver = input.recipientName.trim();
  if (receiver.length < 1 || receiver.length > 70) {
    throw new Error("recipientName length must be 1–70");
  }

  const iban = input.iban.replace(/\s/g, "");
  if (iban.length < 15 || iban.length > 29) {
    throw new Error("invalid IBAN length");
  }

  const receiverCode = normalizeReceiverCode(input.receiverCode);
  const purpose = normalizePurpose(input.purpose);
  const display = (input.displayText ?? "").trim().slice(0, 70);

  const lines = [
    "BCD",
    "002",
    "1",
    "UCT",
    "",
    receiver,
    iban,
    formatAmountLine(input.currency, input.amount),
    receiverCode,
    "",
    "",
    purpose,
    display,
  ];

  return lines.join("\n") + "\n";
}

function utf8ToBase64Url(text: string): string {
  const b = Buffer.from(text, "utf8");
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Офіційний deeplink НБУ: той самий рядок, що кодується в QR.
 * Див.: https://bank.gov.ua/en/payments/use-qr (Deeplink з реквізитами переказу).
 */
export function buildNbuPaymentDeeplink(input: NbuQrPaymentInput): string {
  const payload = buildNbuQrPayloadLines(input);
  return `${NBU_QR_URL_BASE}/${utf8ToBase64Url(payload)}`;
}
