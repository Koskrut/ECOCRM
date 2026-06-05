import type { RawBankTransaction } from "../../bank/providers/types";

function toTrimmedString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Privat24 can return the same operation with different external IDs.
 * REF+REFN is stable enough for idempotent import across repeated sync windows.
 */
export function extractPrivat24StableDedupKey(tx: RawBankTransaction): string | null {
  const payload = tx.rawPayload;
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;

  const ref = toTrimmedString(row.REF ?? row.ref);
  const refn = toTrimmedString(row.REFN ?? row.refn);
  if (ref && refn) return `p24-ref:${ref}+${refn}`;

  const technicalId = toTrimmedString(
    row.TECHNICAL_TRANSACTION_ID ?? row.technicalTransactionId ?? row.technical_transaction_id,
  );
  if (technicalId) return `p24-tech:${technicalId}`;

  return null;
}
