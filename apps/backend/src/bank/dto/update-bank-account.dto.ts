export type UpdateBankAccountDto = {
  name?: string;
  isActive?: boolean;
  syncWindowDays?: number;
  iban?: string;
  /** Код ФОП для 1С/таблицы (напр. 000000123). */
  externalCode?: string | null;
  /** Реквизиты для счёта/РН: { legalName?, taxId?, address?, bankDetails? }. */
  documentRequisites?: Record<string, unknown> | null;
  credentials?: {
    clientId?: string;
    token?: string;
    /** Режим групи ПП: id клієнта в групі (обов'язковий для виписки в цьому режимі). */
    id?: string;
  };
};
