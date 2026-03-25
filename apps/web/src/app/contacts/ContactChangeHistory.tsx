"use client";

import type { ContactChangeHistoryItem } from "@/lib/api/resources/contacts";

type Props = {
  items: ContactChangeHistoryItem[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  v2: boolean;
};

const FIELD_LABELS_UK: Record<string, string> = {
  companyId: "Компанія",
  ownerId: "Менеджер",
  firstName: "Ім'я",
  lastName: "Прізвище",
  middleName: "По батькові",
  phone: "Телефон",
  email: "Email",
  position: "Посада",
  address: "Адреса",
  lat: "Широта",
  lng: "Довгота",
  googlePlaceId: "Google Place ID",
  isPrimary: "Основний контакт",
  externalCode: "Зовнішній код",
  documentDisplayName: "Ім'я в документах",
  region: "Область",
  addressInfo: "Адреса (інфо)",
  city: "Місто",
  clientType: "Тип клієнта",
  status: "Статус",
  marketingCallOptOut: "Маркетингові дзвінки",
  storePasswordReset: "Скидання пароля магазину",
  deliveryDefault: "Профіль доставки за замовчуванням",
};

const FIELD_LABELS_EN: Record<string, string> = {
  companyId: "Company",
  ownerId: "Owner",
  firstName: "First name",
  lastName: "Last name",
  middleName: "Middle name",
  phone: "Phone",
  email: "Email",
  position: "Position",
  address: "Address",
  lat: "Latitude",
  lng: "Longitude",
  googlePlaceId: "Google Place ID",
  isPrimary: "Primary contact",
  externalCode: "External code",
  documentDisplayName: "Document display name",
  region: "Region",
  addressInfo: "Address info",
  city: "City",
  clientType: "Client type",
  status: "Status",
  marketingCallOptOut: "Marketing calls",
  storePasswordReset: "Store password reset",
  deliveryDefault: "Default delivery profile",
};

function formatTimestamp(value: string, v2: boolean): string {
  return new Intl.DateTimeFormat(v2 ? "uk-UA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFieldLabel(field: string, v2: boolean): string {
  return (v2 ? FIELD_LABELS_UK : FIELD_LABELS_EN)[field] ?? field;
}

function formatValue(value: string | null, v2: boolean): string {
  if (value == null || value === "") {
    return "—";
  }
  if (value === "true") {
    return v2 ? "Так" : "Yes";
  }
  if (value === "false") {
    return v2 ? "Ні" : "No";
  }
  return value;
}

function formatActionLabel(action: string, v2: boolean): string {
  if (action === "CREATED") return v2 ? "Створено" : "Created";
  if (action === "UPDATED") return v2 ? "Оновлено" : "Updated";
  if (action === "OWNER_CHANGED") return v2 ? "Змінено менеджера" : "Owner changed";
  if (action === "COMPANY_RELINKED") return v2 ? "Змінено компанію" : "Company changed";
  if (action === "RESET_STORE_PASSWORD") return v2 ? "Скинуто пароль магазину" : "Store password reset";
  if (action === "DELIVERY_DEFAULT_CHANGED") {
    return v2 ? "Змінено профіль доставки за замовчуванням" : "Default delivery profile changed";
  }
  return action;
}

function formatActor(entry: ContactChangeHistoryItem, v2: boolean): string {
  if (entry.changedByUser?.fullName) {
    return entry.changedByUser.fullName;
  }
  if (entry.changedBy) {
    return entry.changedBy;
  }
  return v2 ? "Система" : "System";
}

export function ContactChangeHistory({ items, loading, error, emptyText, v2 }: Props) {
  if (loading) {
    return <p className="text-sm text-zinc-500">{v2 ? "Завантаження…" : "Loading…"}</p>;
  }

  if (error) {
    return <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((entry) => (
        <div key={entry.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-500">
            <span className="font-medium text-zinc-900">{formatActionLabel(entry.action, v2)}</span>
            <span className="text-xs">
              {formatTimestamp(entry.createdAt, v2)} · {formatActor(entry, v2)}
            </span>
          </div>

          {entry.payload.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-zinc-700">
              {entry.payload.map((item, index) => (
                <li key={`${entry.id}-${item.field}-${index}`}>
                  <span className="font-medium">{formatFieldLabel(item.field, v2)}:</span>{" "}
                  {formatValue(item.oldValue, v2)} {"->"} {formatValue(item.newValue, v2)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
