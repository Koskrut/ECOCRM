/**
 * Catalogs of native fields available as additional columns in entity list views.
 *
 * Each entity has:
 * - BASE_COLUMNS: the columns that are always rendered by the list page (name,
 *   actions, etc.). These are NOT admin-configurable — they live in the page
 *   JSX directly. We list them here so the admin UI can flag them as "locked".
 * - NATIVE_COLUMNS: optional columns derived from fields that already exist on
 *   the backend list response. Admin can pick from this list to expose them as
 *   extra columns in the table.
 *
 * Custom fields (from `CustomFieldDefinition`) are NOT listed here: they are
 * loaded dynamically at runtime from `/custom-fields/definitions?entityType=...`.
 */

export type ListEntityType = "COMPANY" | "CONTACT" | "ORDER" | "LEAD";

export type NativeColumnKind =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "phone"
  | "email"
  | "money"
  | "boolean"
  | "enum"
  | "ref";

export type NativeColumn = {
  /** Stable key persisted in `LayoutField.fieldKey`. Must use [a-z0-9_.] only. */
  key: string;
  /** Default Ukrainian label shown in the admin UI. */
  label: string;
  kind: NativeColumnKind;
  /**
   * Optional accessor — given a raw row from the list API, returns the raw
   * value (number/string/Date/null) for the cell. If omitted, the renderer
   * uses `row[key]`.
   */
  accessor?: (row: Record<string, unknown>) => unknown;
};

export type BaseColumn = {
  key: string;
  label: string;
};

export const BASE_COLUMNS: Record<ListEntityType, BaseColumn[]> = {
  COMPANY: [
    { key: "_select", label: "Вибір" },
    { key: "name", label: "Назва" },
    { key: "_actions", label: "Дії" },
  ],
  CONTACT: [
    { key: "name", label: "Ім'я" },
    { key: "_actions", label: "Дії" },
  ],
  ORDER: [
    { key: "orderNumber", label: "Замовлення" },
    { key: "totalAmount", label: "Сума" },
    { key: "_actions", label: "Дії" },
  ],
  LEAD: [
    { key: "name", label: "Ім'я / телефон" },
    { key: "_actions", label: "Дії" },
  ],
};

export const NATIVE_COLUMNS: Record<ListEntityType, NativeColumn[]> = {
  COMPANY: [
    { key: "edrpou", label: "ЄДРПОУ", kind: "text" },
    { key: "taxId", label: "ІПН", kind: "text" },
    { key: "phone", label: "Телефон", kind: "phone" },
    { key: "address", label: "Адреса", kind: "text" },
    {
      key: "owner_name",
      label: "Відповідальний",
      kind: "text",
      accessor: (row) => {
        const owner = row.owner as { fullName?: string } | null | undefined;
        return owner?.fullName ?? null;
      },
    },
    { key: "createdAt", label: "Створено", kind: "datetime" },
    { key: "updatedAt", label: "Оновлено", kind: "datetime" },
  ],
  CONTACT: [
    { key: "phone", label: "Телефон", kind: "phone" },
    { key: "email", label: "Email", kind: "email" },
    { key: "position", label: "Посада", kind: "text" },
    {
      key: "company_name",
      label: "Компанія",
      kind: "text",
      accessor: (row) => {
        const company = row.company as { name?: string } | null | undefined;
        return company?.name ?? null;
      },
    },
    {
      key: "owner_name",
      label: "Відповідальний",
      kind: "text",
      accessor: (row) => {
        const owner = row.owner as { fullName?: string } | null | undefined;
        return owner?.fullName ?? null;
      },
    },
    { key: "city", label: "Місто", kind: "text" },
    { key: "region", label: "Регіон", kind: "text" },
    { key: "clientStage", label: "Стадія клієнта", kind: "enum" },
    { key: "status", label: "Статус", kind: "text" },
    { key: "clientType", label: "Тип клієнта", kind: "text" },
    { key: "hasDebt", label: "Має борг", kind: "boolean" },
    { key: "debtAmount", label: "Сума боргу", kind: "money" },
    { key: "hasCallToday", label: "Дзвінок сьогодні", kind: "boolean" },
    { key: "hasMissedCall", label: "Пропущені", kind: "boolean" },
    { key: "telegramLinked", label: "Telegram підключений", kind: "boolean" },
    { key: "marketingCallOptOut", label: "Не дзвонити", kind: "boolean" },
    { key: "isPrimary", label: "Основний контакт", kind: "boolean" },
    { key: "nextActionAt", label: "Дата наст. дії", kind: "datetime" },
    { key: "createdAt", label: "Створено", kind: "datetime" },
    { key: "updatedAt", label: "Оновлено", kind: "datetime" },
  ],
  ORDER: [
    {
      key: "owner_name",
      label: "Відповідальний",
      kind: "text",
      accessor: (row) => {
        const owner = row.owner as { fullName?: string } | null | undefined;
        return owner?.fullName ?? null;
      },
    },
    {
      key: "company_name",
      label: "Компанія",
      kind: "text",
      accessor: (row) => {
        const company = row.company as { name?: string } | null | undefined;
        return company?.name ?? null;
      },
    },
    {
      key: "client_name",
      label: "Клієнт",
      kind: "text",
      accessor: (row) => {
        const client = row.client as { firstName?: string; lastName?: string } | null | undefined;
        if (!client) return null;
        return [client.firstName, client.lastName].filter(Boolean).join(" ") || null;
      },
    },
    { key: "status", label: "Статус", kind: "enum" },
    { key: "orderStage", label: "Стадія", kind: "text" },
    { key: "paymentStatus", label: "Оплата", kind: "enum" },
    { key: "paymentType", label: "Тип оплати", kind: "enum" },
    { key: "paidAmount", label: "Оплачено", kind: "money" },
    { key: "debtAmount", label: "Борг", kind: "money" },
    { key: "currency", label: "Валюта", kind: "text" },
    { key: "itemsCount", label: "Позицій", kind: "number" },
    { key: "hasTtn", label: "Є ТТН", kind: "boolean" },
    { key: "orderSource", label: "Джерело замовлення", kind: "enum" },
    { key: "createdAt", label: "Створено", kind: "datetime" },
  ],
  LEAD: [
    { key: "phone", label: "Телефон", kind: "phone" },
    { key: "email", label: "Email", kind: "email" },
    { key: "companyName", label: "Компанія (з форми)", kind: "text" },
    {
      key: "owner_name",
      label: "Відповідальний",
      kind: "text",
      accessor: (row) => {
        const owner = row.owner as { fullName?: string } | null | undefined;
        return owner?.fullName ?? null;
      },
    },
    { key: "status", label: "Статус", kind: "enum" },
    { key: "source", label: "Джерело", kind: "enum" },
    { key: "channel", label: "Канал", kind: "enum" },
    { key: "score", label: "Бал", kind: "number" },
    { key: "city", label: "Місто", kind: "text" },
    { key: "region", label: "Регіон", kind: "text" },
    { key: "message", label: "Повідомлення", kind: "text" },
    { key: "hasCallToday", label: "Дзвінок сьогодні", kind: "boolean" },
    { key: "hasMissedCall", label: "Пропущені", kind: "boolean" },
    { key: "lastActivityAt", label: "Остання активність", kind: "datetime" },
    { key: "createdAt", label: "Створено", kind: "datetime" },
    { key: "updatedAt", label: "Оновлено", kind: "datetime" },
  ],
};

export function findNativeColumn(entityType: ListEntityType, key: string): NativeColumn | null {
  const list = NATIVE_COLUMNS[entityType];
  return list.find((c) => c.key === key) ?? null;
}

export const ENTITY_TYPE_LABELS: Record<ListEntityType, string> = {
  COMPANY: "Компанії",
  CONTACT: "Контакти",
  ORDER: "Замовлення",
  LEAD: "Ліди",
};
