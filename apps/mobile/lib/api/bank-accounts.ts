import { apiFetch } from "@/lib/api";

export type BankAccountForOrder = {
  id: string;
  name: string;
  currency?: string;
};

export type BankAccountsForOrderResponse = {
  accounts: BankAccountForOrder[];
  defaultBankAccountId: string | null;
};

export const bankAccountsApi = {
  forOrder: (token: string) =>
    apiFetch<BankAccountsForOrderResponse | BankAccountForOrder[]>("/bank/accounts/for-order", {
      token,
    }),

  normalizeForOrder: (
    data: BankAccountsForOrderResponse | BankAccountForOrder[],
  ): BankAccountsForOrderResponse => {
    if (Array.isArray(data)) {
      return { accounts: data, defaultBankAccountId: data[0]?.id ?? null };
    }
    return {
      accounts: data.accounts ?? [],
      defaultBankAccountId: data.defaultBankAccountId ?? null,
    };
  },
};
