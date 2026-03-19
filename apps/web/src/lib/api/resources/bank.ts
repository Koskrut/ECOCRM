import { apiHttp } from "../client";

export type BankAccountItem = {
  id: string;
  name: string;
  currency: string;
  iban?: string | null;
  isActive: boolean;
};

/** For order form: list active FOP (id, name). */
export type BankAccountForOrderItem = { id: string; name: string };

export async function listBankAccountsForOrder(): Promise<BankAccountForOrderItem[]> {
  const res = await apiHttp.get<
    | BankAccountForOrderItem[]
    | { accounts: BankAccountForOrderItem[]; defaultBankAccountId?: string | null }
  >("/bank/accounts/for-order");
  const d = res.data;
  if (Array.isArray(d)) return d;
  return Array.isArray(d?.accounts) ? d.accounts : [];
}

export async function deleteBankAccount(id: string): Promise<void> {
  await apiHttp.delete(`/bank/accounts/${id}`);
}

