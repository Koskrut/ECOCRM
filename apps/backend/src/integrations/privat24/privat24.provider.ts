import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { BankStatementProvider, RawBankTransaction } from "../../bank/providers/types";
import { extractPrivat24StableDedupKey } from "./privat24-dedup";
import { Privat24Client, type Privat24Credentials } from "./privat24.client";

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

@Injectable()
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
    if (!creds?.token || !iban?.trim()) {
      return { transactions: [] };
    }
    const result = await this.client.getStatement(creds, iban.trim(), from, to, cursor);
    const transactions = result.transactions.map((tx) => {
      const out: RawBankTransaction = { ...tx };
      if (!out.externalId && !out.hash) out.hash = toRawTxHash(tx);
      return out;
    });
    return { transactions, nextCursor: result.nextCursor };
  }

  resolveStableDedupKey(tx: RawBankTransaction): string | null {
    return extractPrivat24StableDedupKey(tx);
  }
}
