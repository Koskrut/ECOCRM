import { appendFileSync } from "node:fs";
import type { BankStatementProvider, RawBankTransaction } from "./types";
import type { TransactionDirection } from "@prisma/client";
import { createHash } from "node:crypto";
import { Privat24Client, type Privat24Credentials } from "../privat24.client";

const DEBUG_LOG_PATH = "/Users/konstantin/CRM/.cursor/debug-f04031.log";
function debugLog(msg: string, data: Record<string, unknown> = {}) {
  try {
    appendFileSync(
      DEBUG_LOG_PATH,
      JSON.stringify({ timestamp: Date.now(), location: "privat24.provider", message: msg, data }) + "\n",
    );
  } catch (_) {}
}

function toRawTxHash(tx: RawBankTransaction): string {
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

/**
 * Fetches statements via Privat24Client. Maps API response to RawBankTransaction;
 * when API does not provide stable id, sets hash for dedup.
 */
export class Privat24Provider implements BankStatementProvider {
  private readonly client = new Privat24Client();

  async fetchStatement(
    _accountId: string,
    credentials: unknown,
    iban: string | null,
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<{ transactions: RawBankTransaction[]; nextCursor?: string }> {
    const creds = credentials as Privat24Credentials | null | undefined;
    if (!creds?.token) {
      debugLog("fetchStatement skip no token", {});
      return { transactions: [] };
    }
    if (!iban || !iban.trim()) {
      debugLog("fetchStatement skip no iban", {});
      return { transactions: [] };
    }
    const result = await this.client.getStatement(creds, iban.trim(), from, to, cursor);
    debugLog("fetchStatement result", { count: result.transactions.length, hasNextCursor: !!result.nextCursor });
    const transactions = result.transactions.map((tx) => {
      const out: RawBankTransaction = { ...tx };
      if (!out.externalId && !out.hash) out.hash = toRawTxHash(tx);
      return out;
    });
    return { transactions, nextCursor: result.nextCursor };
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
