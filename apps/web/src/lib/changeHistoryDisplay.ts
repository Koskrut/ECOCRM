import { formatDate, formatDateTime } from "./crmDatetime";
import { labelEnumValue } from "./crmValueLabels";

type AuditDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

type AuditEntry = {
  action: string;
  changedBy: string;
  changedByName?: string | null;
  diff?: AuditDiffEntry[] | null;
  before?: unknown;
  after?: unknown;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Назва",
  fullName: "ПІБ",
  firstName: "Імʼя",
  lastName: "Прізвище",
  middleName: "По батькові",
  edrpou: "ЄДРПОУ",
  taxId: "ІПН",
  phone: "Телефон",
  email: "Email",
  address: "Адреса",
  addressInfo: "Адреса",
  region: "Область",
  city: "Місто",
  lat: "Широта",
  lng: "Довгота",
  ownerId: "Відповідальний",
  companyId: "Компанія",
  clientId: "Клієнт",
  contactId: "Контакт",
  companyName: "Компанія",
  orderStage: "Етап",
  status: "Статус",
  deliveryMethod: "Доставка",
  paymentMethod: "Спосіб оплати",
  paymentType: "Умови оплати",
  deliveryStatus: "Статус доставки",
  financialStatus: "Оплата",
  paymentDueDate: "Строк оплати",
  bankAccountId: "Рахунок ФОП",
  warehouseId: "Склад",
  documentsRequested: "Документи",
  currency: "Валюта",
  subtotalAmount: "Сума",
  discountAmount: "Знижка",
  totalAmount: "Разом",
  paidAmount: "Сплачено",
  debtAmount: "Борг",
  creditAmount: "Переплата",
  comment: "Коментар",
  message: "Повідомлення",
  orderSource: "Джерело",
  source: "Джерело",
  channel: "Канал",
  invoiceNumber: "Номер рахунку",
  invoiceDate: "Дата рахунку",
  waybillNumber: "Номер РН",
  waybillDate: "Дата РН",
  exchangeRate: "Курс",
  returnAdjustmentAmount: "Корекція повернення",
  fxWriteOffAmount: "Списання курсової різниці",
  fxWriteOffNote: "Коментар до списання",
  parentOrderId: "Батьківське замовлення",
  position: "Посада",
  isPrimary: "Основний контакт",
  externalCode: "Код 1С",
  documentDisplayName: "Назва в документах",
  clientType: "Тип клієнта",
  marketingCallOptOut: "Без маркетингових дзвінків",
  nextActionType: "Наступна дія",
  nextActionAt: "Дата наступної дії",
  nextActionNote: "Нотатка до дії",
  clientStage: "Етап клієнта",
  statusReason: "Причина статусу",
  score: "Оцінка",
  convertedOrderId: "Замовлення",
  orderNumber: "Номер",
  discountPercent: "Знижка, %",
  qty: "Кількість",
  price: "Ціна",
  "deliveryData.city": "Місто доставки",
  "deliveryData.warehouse": "Відділення",
  "deliveryData.address": "Адреса доставки",
  "deliveryData.novaPoshta.city": "Місто",
  "deliveryData.novaPoshta.warehouse": "Відділення",
  "deliveryData.novaPoshta.ttn.number": "ТТН",
};

const NOISE_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "syncedAt",
  "lastNpStatusSyncAt",
  "legacyRaw",
  "legacySource",
  "legacyId",
  "phoneNormalized",
  "googlePlaceId",
  "sourceMeta",
  "npCityRef",
  "fxWriteOffByUserId",
  "fxWriteOffAt",
  "lastActivityAt",
]);

const MONEY_FIELDS = new Set([
  "subtotalAmount",
  "discountAmount",
  "totalAmount",
  "paidAmount",
  "debtAmount",
  "creditAmount",
  "returnAdjustmentAmount",
  "fxWriteOffAmount",
  "price",
  "cost",
]);

const DATE_FIELDS = new Set([
  "paymentDueDate",
  "invoiceDate",
  "waybillDate",
  "nextActionAt",
]);

const FREE_TEXT_FIELDS = new Set([
  "comment",
  "message",
  "name",
  "fullName",
  "firstName",
  "lastName",
  "middleName",
  "address",
  "addressInfo",
  "fxWriteOffNote",
  "statusReason",
  "nextActionNote",
  "position",
  "documentDisplayName",
  "companyName",
  "title",
  "body",
]);

const CREATE_PRIORITY = [
  "orderNumber",
  "name",
  "fullName",
  "orderStage",
  "status",
  "totalAmount",
  "companyId",
  "clientId",
  "contactId",
  "ownerId",
  "deliveryMethod",
  "paymentType",
  "paymentMethod",
  "phone",
  "email",
  "comment",
];

export type ChangeRowMode = "transition" | "added" | "removed" | "set" | "text";

export type ChangeRow = {
  field: string;
  label: string;
  mode: ChangeRowMode;
  before: string;
  after: string;
};

export type PresentedAudit = {
  headline: string;
  actor: string;
  rows: ChangeRow[];
  /** Timestamp-only or internal write with nothing a person needs to read. */
  technical: boolean;
};

function leaf(field: string): string {
  return field.split(".").pop() ?? field;
}

export function looksLikeOpaqueId(value: string): boolean {
  const v = value.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return true;
  }
  return /^c[a-z0-9]{20,}$/i.test(v);
}

function isNoiseField(field: string): boolean {
  const name = leaf(field);
  if (NOISE_FIELDS.has(field) || NOISE_FIELDS.has(name)) return true;
  if (name === "id") return true;
  if (/Ref$/.test(name) || /StatusCode$/i.test(name)) return true;
  return false;
}

function isRelationField(field: string): boolean {
  return /Id$/.test(leaf(field));
}

export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const name = leaf(field);
  if (FIELD_LABELS[name]) return FIELD_LABELS[name];
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value);
}

function isEmpty(value: unknown): boolean {
  return value == null || value === "";
}

function formatScalar(field: string, value: unknown, currency: string | null): string {
  if (isEmpty(value)) return "";
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  if (typeof value === "number" && Number.isFinite(value)) {
    const name = leaf(field);
    if (MONEY_FIELDS.has(name)) {
      const amount = formatAmount(value);
      return currency ? `${amount} ${currency}` : amount;
    }
    if (name === "exchangeRate" || name === "lat" || name === "lng") {
      return formatAmount(value);
    }
    return formatAmount(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "<redacted>") return "";
    if (isRelationField(field) && looksLikeOpaqueId(trimmed)) return "";
    const enumLabel = labelEnumValue(field, trimmed);
    if (enumLabel) return enumLabel;
    if (DATE_FIELDS.has(leaf(field)) || /^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return formatDateTime(trimmed, trimmed);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return formatDate(trimmed, trimmed);
    return trimmed;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => formatScalar(field, item, currency)).filter(Boolean).join(", ");
    }
    return value.length === 1 ? "1 запис" : `${value.length} записів`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const named = obj.name ?? obj.fullName ?? obj.title ?? obj.number ?? obj.documentNumber;
    if (typeof named === "string" && named.trim()) return named.trim();
    return Object.keys(obj).length > 0 ? "оновлено" : "";
  }
  return String(value);
}

function readCurrency(item: Pick<AuditEntry, "before" | "after">): string | null {
  for (const source of [item.after, item.before]) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const currency = (source as Record<string, unknown>).currency;
      if (typeof currency === "string" && currency.trim()) return currency.trim();
    }
  }
  return null;
}

function rawEntries(item: Pick<AuditEntry, "action" | "diff" | "after">): AuditDiffEntry[] {
  if (Array.isArray(item.diff) && item.diff.length > 0) return item.diff;
  if (item.action === "CREATE" && item.after && typeof item.after === "object" && !Array.isArray(item.after)) {
    return Object.entries(item.after as Record<string, unknown>).map(([field, after]) => ({
      field,
      before: null,
      after,
    }));
  }
  return [];
}

function rowMode(before: string, after: string, creating: boolean): ChangeRowMode {
  if (creating) return "set";
  const long = before.length > 80 || after.length > 80 || before.includes("\n") || after.includes("\n");
  if (long && before && after) return "text";
  if (!before && after) return "added";
  if (before && !after) return "removed";
  return "transition";
}

function relationPhrase(before: unknown, after: unknown): "added" | "removed" | "changed" | null {
  const had = !isEmpty(before);
  const has = !isEmpty(after);
  if (!had && has) return "added";
  if (had && !has) return "removed";
  if (had && has) return "changed";
  return null;
}

function integrationActor(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return "Інтеграція";
  if (key.includes("ringostat")) return "Ringostat";
  if (key.includes("kyivstar")) return "Київстар";
  if (key.includes("bitrix")) return "Bitrix";
  if (key.includes("nova")) return "Нова Пошта";
  const words = raw.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatActor(changedBy: string, changedByName?: string | null): string {
  const name = changedByName?.trim();
  if (name && !looksLikeOpaqueId(name)) return name;
  if (!changedBy || changedBy === "system") return "Система";
  if (changedBy.startsWith("integration:")) {
    return integrationActor(changedBy.slice("integration:".length));
  }
  if (changedBy.startsWith("cron:")) return "Автоматично";
  if (looksLikeOpaqueId(changedBy)) return "Користувач";
  return changedBy;
}

function fieldsPhrase(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} поле`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} поля`;
  return `${count} полів`;
}

function headlineFor(action: string, rows: ChangeRow[]): string {
  if (action === "CREATE") return "Створено";
  if (action === "DELETE") return "Видалено";
  if (rows.length === 0) return "Службове оновлення";
  if (rows.length === 1) return rows[0].label;
  const stage = rows.find((row) => row.field === "orderStage" || row.field === "status");
  if (stage && rows.length <= 3) return stage.label;
  return `Змінено ${fieldsPhrase(rows.length)}`;
}

function sortCreateRows(rows: ChangeRow[]): ChangeRow[] {
  const rank = new Map(CREATE_PRIORITY.map((field, index) => [field, index]));
  return [...rows].sort((a, b) => {
    const ar = rank.get(leaf(a.field)) ?? 100;
    const br = rank.get(leaf(b.field)) ?? 100;
    return ar - br;
  });
}

export function presentAuditEntry(item: AuditEntry): PresentedAudit {
  const currency = readCurrency(item);
  const creating = item.action === "CREATE";
  const rows: ChangeRow[] = [];

  for (const entry of rawEntries(item)) {
    if (isNoiseField(entry.field)) continue;
    if (FREE_TEXT_FIELDS.has(leaf(entry.field)) && entry.before === entry.after) continue;

    if (isRelationField(entry.field)) {
      const phrase = relationPhrase(entry.before, entry.after);
      if (!phrase) continue;
      const beforeText = formatScalar(entry.field, entry.before, currency);
      const afterText = formatScalar(entry.field, entry.after, currency);
      if (!beforeText && !afterText) {
        rows.push({
          field: entry.field,
          label: fieldLabel(entry.field),
          mode: phrase === "removed" ? "removed" : "set",
          before: phrase === "removed" ? "прибрано" : "",
          after: phrase === "added" ? "призначено" : phrase === "changed" ? "змінено" : "",
        });
        continue;
      }
    }

    const before = formatScalar(entry.field, entry.before, currency);
    const after = formatScalar(entry.field, entry.after, currency);
    if (!before && !after) continue;
    if (before === after) continue;
    rows.push({
      field: entry.field,
      label: fieldLabel(entry.field),
      mode: rowMode(before, after, creating),
      before,
      after,
    });
  }

  const hasMoney = rows.some((row) => MONEY_FIELDS.has(leaf(row.field)));
  const withoutCurrency = hasMoney ? rows.filter((row) => leaf(row.field) !== "currency") : rows;
  const visible = creating ? sortCreateRows(withoutCurrency).slice(0, 8) : withoutCurrency;
  return {
    headline: headlineFor(item.action, visible),
    actor: formatActor(item.changedBy, item.changedByName),
    rows: visible,
    technical: visible.length === 0 && item.action !== "DELETE",
  };
}
