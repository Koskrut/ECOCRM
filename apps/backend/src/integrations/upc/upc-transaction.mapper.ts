import type { TransactionDirection } from "@prisma/client";
import type { RawBankTransaction } from "../../bank/providers/types";

type BerlinGroupTransaction = {
  transactionId?: string;
  entryReference?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount?: string; currency?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationStructured?: string;
  creditorName?: string;
  debtorName?: string;
  creditorAccount?: { iban?: string };
  debtorAccount?: { iban?: string };
  creditDebitIndicator?: string;
};

export function mapUpcTransactionToRaw(row: BerlinGroupTransaction): RawBankTransaction | null {
  const amountRaw = row.transactionAmount?.amount;
  const amount = amountRaw != null ? Math.abs(parseFloat(String(amountRaw))) : NaN;
  if (!Number.isFinite(amount)) return null;

  const currency = row.transactionAmount?.currency ?? "UAH";
  const indicator = (row.creditDebitIndicator ?? "").toUpperCase();
  const direction: TransactionDirection = indicator === "DBIT" || indicator === "DEBIT" ? "OUT" : "IN";

  const dateStr = row.bookingDate ?? row.valueDate;
  const bookedAt = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(bookedAt.getTime())) return null;

  const description =
    row.remittanceInformationUnstructured ??
    row.remittanceInformationStructured ??
    undefined;

  const externalId = row.transactionId ?? row.entryReference ?? undefined;
  const counterpartyName =
    direction === "IN" ? row.debtorName ?? undefined : row.creditorName ?? undefined;
  const counterpartyIban =
    direction === "IN"
      ? row.debtorAccount?.iban ?? undefined
      : row.creditorAccount?.iban ?? undefined;

  const stableKey = externalId ? `upc:${externalId}` : undefined;

  return {
    externalId,
    hash: stableKey,
    bookedAt,
    amount,
    currency,
    direction,
    description,
    counterpartyName,
    counterpartyIban,
    rawPayload: row as unknown as Record<string, unknown>,
  };
}

export function extractUpcStableDedupKey(tx: RawBankTransaction): string | null {
  const payload = tx.rawPayload;
  if (!payload || typeof payload !== "object") return null;
  const row = payload as BerlinGroupTransaction;
  const id = row.transactionId ?? row.entryReference;
  return id ? `upc:${id}` : null;
}
