import { formatDate, formatDateTime } from "@/lib/crmDatetime";
import type { NativeColumn } from "./columnCatalog";
import type { ResolvedColumn } from "./useListColumns";

const EMPTY = "—";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatNumber(value: unknown): string {
  if (value == null || value === "") return EMPTY;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return EMPTY;
  return n.toLocaleString("uk-UA");
}

function formatMoney(value: unknown): string {
  if (value == null || value === "") return EMPTY;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return EMPTY;
  return n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBoolean(value: unknown): string {
  if (value == null) return EMPTY;
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  if (typeof value === "string") {
    if (value === "true") return "Так";
    if (value === "false") return "Ні";
  }
  return EMPTY;
}

function nativeRender(column: NativeColumn, raw: unknown): string {
  if (raw == null || raw === "") return EMPTY;
  switch (column.kind) {
    case "datetime":
      return formatDateTime(raw as string);
    case "date":
      return formatDate(raw as string);
    case "number":
      return formatNumber(raw);
    case "money":
      return formatMoney(raw);
    case "boolean":
      return formatBoolean(raw);
    case "phone":
    case "email":
    case "text":
    case "enum":
    case "ref":
    default:
      if (typeof raw === "string" || typeof raw === "number") return String(raw);
      if (isPlainObject(raw)) {
        const candidate = (raw.label ?? raw.name ?? raw.value) as unknown;
        return candidate != null ? String(candidate) : EMPTY;
      }
      return EMPTY;
  }
}

function customRender(definitionType: string, raw: unknown): string {
  if (raw == null || raw === "") return EMPTY;
  switch (definitionType) {
    case "DATE":
      return formatDate(raw as string);
    case "NUMBER":
      return formatNumber(raw);
    case "MONEY":
      return formatMoney(raw);
    case "BOOLEAN":
      return formatBoolean(raw);
    case "MULTISELECT":
      if (Array.isArray(raw)) return raw.map((v) => String(v)).join(", ");
      return EMPTY;
    case "DICTIONARY_ITEM":
      if (isPlainObject(raw)) {
        const candidate = (raw.label ?? raw.value ?? raw.id) as unknown;
        return candidate != null ? String(candidate) : EMPTY;
      }
      return EMPTY;
    case "JSON":
      try {
        return typeof raw === "string" ? raw : JSON.stringify(raw);
      } catch {
        return EMPTY;
      }
    case "TEXT":
    case "SELECT":
    case "USER":
    default:
      return String(raw);
  }
}

export function renderCellText(
  column: ResolvedColumn,
  row: Record<string, unknown>,
  customValues: Record<string, Record<string, unknown>>,
): string {
  if (column.source === "native") {
    const raw = column.native.accessor ? column.native.accessor(row) : row[column.native.key];
    return nativeRender(column.native, raw);
  }
  const rowId = String(row.id ?? "");
  const bag = rowId ? customValues[rowId] : undefined;
  const raw = bag ? bag[column.definitionKey] : null;
  return customRender(column.definitionType, raw);
}
