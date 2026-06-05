import type { BankProvider } from "@prisma/client";

export type CreateBankAccountDto = {
  provider: BankProvider;
  name: string;
  currency: string;
  iban?: string;
  accountNumber?: string;
  /** Код ФОП для 1С/таблицы. */
  externalCode?: string | null;
  /** Код счета ФОП для 1С/таблицы. */
  accountExternalCode?: string | null;
  /** Реквизиты для документов (счёт/РН). */
  documentRequisites?: Record<string, unknown> | null;
  credentials?: {
    cardNumber?: string;
    clientId?: string;
    token?: string;
    /** Режим групи ПП: id клієнта в групі. */
    id?: string;
    /** UPC Open Banking */
    consentId?: string;
    resourceId?: string;
    accessToken?: string;
    bankCode?: string;
  };
  isActive?: boolean;
};
