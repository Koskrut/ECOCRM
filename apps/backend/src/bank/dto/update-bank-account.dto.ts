export type UpdateBankAccountDto = {
  name?: string;
  isActive?: boolean;
  syncWindowDays?: number;
  iban?: string;
  credentials?: {
    clientId?: string;
    token?: string;
    /** Режим групи ПП: id клієнта в групі (обов'язковий для виписки в цьому режимі). */
    id?: string;
  };
};
