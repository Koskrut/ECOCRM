import { Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UpcHttpClient } from "./upc-http.client";
import { mapUpcTransactionToRaw } from "./upc-transaction.mapper";
import type { RawBankTransaction } from "../../bank/providers/types";

type TransactionsResponse = {
  transactions?: { booked?: unknown[] };
  account?: { iban?: string };
  _links?: { next?: { href?: string } };
};

@Injectable()
export class UpcAisClient {
  constructor(private readonly http: UpcHttpClient) {}

  async fetchTransactions(
    resourceId: string,
    accessToken: string,
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<{ transactions: RawBankTransaction[]; nextCursor?: string }> {
    if (this.http.isMockMode()) {
      return this.fetchMockTransactions();
    }

    const dateFrom = from.toISOString().slice(0, 10);
    const dateTo = to.toISOString().slice(0, 10);
    const path = cursor
      ? cursor
      : `/v1/accounts/${encodeURIComponent(resourceId)}/transactions?dateFrom=${dateFrom}&dateTo=${dateTo}&bookingStatus=booked`;

    const data = await this.http.request<TransactionsResponse>({
      path,
      accessToken,
    });

    const booked = data.transactions?.booked ?? [];
    const transactions: RawBankTransaction[] = [];
    for (const row of booked) {
      const mapped = mapUpcTransactionToRaw(row as Parameters<typeof mapUpcTransactionToRaw>[0]);
      if (mapped) transactions.push(mapped);
    }

    const nextHref = data._links?.next?.href;
    return { transactions, nextCursor: nextHref };
  }

  private fetchMockTransactions(): { transactions: RawBankTransaction[]; nextCursor?: string } {
    const fixturePath = join(__dirname, "__fixtures__", "upc-transactions.json");
    let rows: unknown[] = [];
    try {
      const raw = readFileSync(fixturePath, "utf8");
      rows = JSON.parse(raw) as unknown[];
    } catch {
      rows = [
        {
          transactionId: "mock-tx-1",
          bookingDate: new Date().toISOString().slice(0, 10),
          transactionAmount: { amount: "1500.00", currency: "UAH" },
          creditDebitIndicator: "CRDT",
          remittanceInformationUnstructured: "Оплата заказ ORD-10001",
          debtorName: "ТОВ Тест",
        },
      ];
    }
    const transactions: RawBankTransaction[] = [];
    for (const row of rows) {
      const mapped = mapUpcTransactionToRaw(row as Parameters<typeof mapUpcTransactionToRaw>[0]);
      if (mapped) transactions.push(mapped);
    }
    return { transactions: transactions };
  }
}
