import { apiFetch } from "@/lib/api";

export type OrderDiscountsConfig = {
  percents: number[];
};

export const settingsApi = {
  orderDiscounts: (token: string) =>
    apiFetch<OrderDiscountsConfig>("/settings/order-discounts", { token }),
};
