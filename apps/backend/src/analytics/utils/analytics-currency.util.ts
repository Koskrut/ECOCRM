export {
  getBaseCurrency,
  paymentToBase,
  toBaseCurrency,
  toUsd,
  usdToBase,
} from "../../common/currency.util";

export function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
