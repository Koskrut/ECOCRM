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
  };
  isActive?: boolean;
};
