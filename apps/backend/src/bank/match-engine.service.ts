import { Injectable } from "@nestjs/common";
import { PaymentMatchingService } from "./payment-matching.service";

/** @deprecated use PaymentMatchingService directly; kept for BankSyncService compatibility */
@Injectable()
export class MatchEngineService {
  constructor(private readonly matching: PaymentMatchingService) {}

  async run(): Promise<{ matched: number }> {
    const result = await this.matching.run();
    return { matched: result.matched };
  }

  async findOrderByDescription(description: string | null): Promise<string | null> {
    return this.matching.scoreCandidates({
      id: "",
      description,
      amount: 0,
      bookedAt: new Date(),
      counterpartyName: null,
    }).then((c) => c[0]?.orderId ?? null);
  }

  async createPaymentFromTransaction(bankTransactionId: string, orderId: string): Promise<void> {
    await this.matching.createPaymentFromTransaction(bankTransactionId, orderId);
  }
}
