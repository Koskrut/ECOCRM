import { Injectable } from "@nestjs/common";
import type { BankStatementProvider, RawBankTransaction } from "../../bank/providers/types";
import { extractUpcStableDedupKey } from "./upc-transaction.mapper";
import { UpcAisClient } from "./upc-ais.client";

export type UpcCredentials = {
  accessToken?: string;
  resourceId?: string;
  consentId?: string;
};

@Injectable()
export class UpcProvider implements BankStatementProvider {
  constructor(private readonly ais: UpcAisClient) {}

  async fetchStatement(
    _accountId: string,
    credentials: unknown,
    iban: string | null,
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<{ transactions: RawBankTransaction[]; nextCursor?: string }> {
    const creds = credentials as UpcCredentials | null | undefined;
    const accessToken = creds?.accessToken;
    const resourceId = creds?.resourceId ?? iban?.trim();
    if (!accessToken || !resourceId) {
      return { transactions: [] };
    }
    return this.ais.fetchTransactions(resourceId, accessToken, from, to, cursor);
  }

  resolveStableDedupKey(tx: RawBankTransaction): string | null {
    return extractUpcStableDedupKey(tx);
  }
}
