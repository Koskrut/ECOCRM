import type { BankStatementProvider, RawBankTransaction } from "./types";
import type { TransactionDirection } from "@prisma/client";

/**
 * Stub provider for Privat24. For MVP use CSV upload or replace with real API when available.
 */
export class Privat24Provider implements BankStatementProvider {
  async fetchStatement(
    _accountId: string,
    _credentials: unknown,
    _from: Date,
    _to: Date,
    _cursor?: string,
  ): Promise<{ transactions: RawBankTransaction[]; nextCursor?: string }> {
    return { transactions: [] };
  }
}

/**
 * Parse CSV buffer to rows. First line = headers. Supports quoted fields.
 */
export function parseCsvToRows(buffer: Buffer): Array<Record<string, string>> {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Parse transactions from a CSV-like format (e.g. exported from Privat24).
 * Can be used by an upload endpoint to create RawBankTransaction[].
 */
export function parsePrivat24CsvRows(rows: Array<Record<string, string>>): RawBankTransaction[] {
  const result: RawBankTransaction[] = [];
  for (const row of rows) {
    const amountStr = row.amount ?? row.sum ?? row["Сума"] ?? "0";
    const amount = parseFloat(String(amountStr).replace(/,/g, ".").replace(/\s/g, "")) || 0;
    const direction: TransactionDirection = amount >= 0 ? "IN" : "OUT";
    const desc = row.description ?? row.details ?? row["Призначення"] ?? row["Опис"] ?? "";
    const dateStr = row.date ?? row.bookedAt ?? row["Дата"] ?? new Date().toISOString();
    const externalId = row.id ?? row.transactionId ?? row["ID"] ?? `csv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    result.push({
      externalId,
      bookedAt: new Date(dateStr),
      amount: Math.abs(amount),
      currency: row.currency ?? "UAH",
      direction,
      description: desc || undefined,
      counterpartyName: row.counterpartyName ?? row["Контрагент"] ?? undefined,
      counterpartyIban: row.counterpartyIban ?? row.iban ?? undefined,
      rawPayload: row as unknown as Record<string, unknown>,
    });
  }
  return result;
}
