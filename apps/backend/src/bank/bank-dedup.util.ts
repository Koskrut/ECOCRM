import { createHash } from "node:crypto";
import type { RawBankTransaction } from "./providers/types";

export function computeTxHash(tx: RawBankTransaction): string {
  const payload = [
    tx.bookedAt instanceof Date ? tx.bookedAt.toISOString() : String(tx.bookedAt),
    tx.amount,
    tx.currency,
    tx.direction,
    tx.description ?? "",
    tx.counterpartyName ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/** Stable dedup key: provider ref > externalId > content hash. */
export function resolveBankTransactionDedupKey(
  provider: { resolveStableDedupKey?(tx: RawBankTransaction): string | null } | undefined,
  tx: RawBankTransaction,
): string {
  const stableProviderKey = provider?.resolveStableDedupKey?.(tx) ?? null;
  const hash = tx.hash ?? computeTxHash(tx);
  return stableProviderKey ?? tx.externalId ?? hash;
}
