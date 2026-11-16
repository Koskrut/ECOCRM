import type { OrderStage } from "@prisma/client";

export const SERIAL_MAX_LENGTH = 128;

/** Stages at which every unit on the order must already have a serial. */
const SERIAL_REQUIRED_STAGES = new Set<OrderStage>([
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
]);

const SERIAL_LOCKED_STAGES = new Set<OrderStage>([
  ...SERIAL_REQUIRED_STAGES,
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
]);

export class SerialNormalizeError extends Error {
  constructor(readonly reason: "empty" | "long" | "control") {
    super(reason);
    this.name = "SerialNormalizeError";
  }
}

export function normalizeSerial(raw: unknown): string {
  const serial = String(raw ?? "")
    .replace(/[\r\n\t]/g, "")
    .trim();
  if (!serial) throw new SerialNormalizeError("empty");
  if (serial.length > SERIAL_MAX_LENGTH) throw new SerialNormalizeError("long");
  if (/[\u0000-\u001F\u007F]/.test(serial)) throw new SerialNormalizeError("control");
  return serial;
}

export function serialKey(serial: string): string {
  return serial.toUpperCase();
}

export function serialNormalizeMessage(reason: SerialNormalizeError["reason"]): string {
  if (reason === "empty") return "Серійний номер порожній.";
  if (reason === "long") return `Серійний номер довший за ${SERIAL_MAX_LENGTH} символів.`;
  return "Серійний номер містить неприпустимі символи.";
}

/**
 * Serials are required only when the order first enters picking-complete stages.
 * Orders already at READY_TO_SHIP or later are not blocked again.
 */
export function enteringShipmentRequiresSerials(
  from: OrderStage | null | undefined,
  to: OrderStage,
): boolean {
  if (!SERIAL_REQUIRED_STAGES.has(to)) return false;
  if (from != null && SERIAL_REQUIRED_STAGES.has(from)) return false;
  return true;
}

/** Serials stay editable until the order is marked ready to ship or closed. */
export function serialsEditableAtStage(stage: OrderStage | null | undefined): boolean {
  if (stage == null) return true;
  return !SERIAL_LOCKED_STAGES.has(stage);
}

export function serialQtyGapMessage(nextQty: number, serialCount: number): string | null {
  if (nextQty >= serialCount) return null;
  return `У позиції ${serialCount} серійних номерів. Приберіть зайві, перш ніж зменшити кількість до ${nextQty}.`;
}
