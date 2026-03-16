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
  const res = await apiHttp.get<BankAccountForOrderItem[]>("/bank/accounts/for-order");
  return res.data;
}

export async function deleteBankAccount(id: string): Promise<void> {
  await apiHttp.delete(`/bank/accounts/${id}`);
}

