import { apiFetch } from "@/lib/api";
import type { BaseCurrency } from "@/lib/order-currency";

export type OrderDiscountsConfig = {
  percents: number[];
};

export type CurrencyConfig = {
  baseCurrency: BaseCurrency;
};

export const settingsApi = {
  orderDiscounts: (token: string) =>
    apiFetch<OrderDiscountsConfig>("/settings/order-discounts", { token }),
  currencyConfig: (token: string) =>
    apiFetch<CurrencyConfig>("/settings/currency-config", { token }),
};
