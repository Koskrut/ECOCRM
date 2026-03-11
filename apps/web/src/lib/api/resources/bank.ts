import { apiHttp } from "../client";

export type BankAccountItem = {
  id: string;
  name: string;
  currency: string;
  iban?: string | null;
  isActive: boolean;
};

export async function deleteBankAccount(id: string): Promise<void> {
  await apiHttp.delete(`/bank/accounts/${id}`);
}

