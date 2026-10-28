/** Pure helpers for Nova Poshta cash-on-delivery (наложений платіж). */

const COD_UAH_TOLERANCE = 1;

/** True when COD UAH differs from debt UAH by more than 1 UAH. Zero COD always matches. */
export function codAmountMismatchesDebtUah(codUah: number, debtUah: number): boolean {
  if (!(codUah > 0)) return false;
  return Math.abs(codUah - debtUah) > COD_UAH_TOLERANCE;
}

/** Cap COD converted into order currency by remaining debt. */
export function capCodByDebt(amountInOrderCurrency: number, debt: number): number {
  const amount = Math.max(0, Number(amountInOrderCurrency) || 0);
  const d = Math.max(0, Number(debt) || 0);
  return Math.min(amount, d);
}

export function isNpCodMoneyTransferStatusCode(code: string | null | undefined): boolean {
  const c = String(code ?? "").trim();
  return c === "10" || c === "11";
}
