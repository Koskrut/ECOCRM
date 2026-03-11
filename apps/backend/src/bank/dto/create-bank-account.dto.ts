import type { BankProvider } from "@prisma/client";

export type CreateBankAccountDto = {
  provider: BankProvider;
  name: string;
  currency: string;
  iban?: string;
  accountNumber?: string;
  credentials?: {
    cardNumber?: string;
    clientId?: string;
    token?: string;
    /** Режим групи ПП: id клієнта в групі. */
    id?: string;
  };
  isActive?: boolean;
};
