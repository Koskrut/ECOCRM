import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type ExchangeRates = {
  UAH_TO_USD: number;
  EUR_TO_USD: number;
};

const EXCHANGE_RATES_KEY = "exchange_rates";
const DEFAULT_RATES: ExchangeRates = {
  UAH_TO_USD: 0.024,
  EUR_TO_USD: 1.05,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getExchangeRates(): Promise<ExchangeRates> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: EXCHANGE_RATES_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return { ...DEFAULT_RATES };
    }
    const v = row.value as Record<string, unknown>;
    return {
      UAH_TO_USD: typeof v.UAH_TO_USD === "number" ? v.UAH_TO_USD : DEFAULT_RATES.UAH_TO_USD,
      EUR_TO_USD: typeof v.EUR_TO_USD === "number" ? v.EUR_TO_USD : DEFAULT_RATES.EUR_TO_USD,
    };
  }

  async setExchangeRates(rates: Partial<ExchangeRates>): Promise<ExchangeRates> {
    const current = await this.getExchangeRates();
    const next: ExchangeRates = {
      UAH_TO_USD: typeof rates.UAH_TO_USD === "number" ? rates.UAH_TO_USD : current.UAH_TO_USD,
      EUR_TO_USD: typeof rates.EUR_TO_USD === "number" ? rates.EUR_TO_USD : current.EUR_TO_USD,
    };
    await this.prisma.systemSetting.upsert({
      where: { id: EXCHANGE_RATES_KEY },
      create: { id: EXCHANGE_RATES_KEY, value: next },
      update: { value: next },
    });
    return next;
  }
}
