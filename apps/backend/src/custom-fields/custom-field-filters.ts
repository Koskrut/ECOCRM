import { CustomFieldType, Prisma } from "@prisma/client";

export type CustomFilterMap = Record<string, string | string[]>;

function asText(value: string | string[]): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  const first = value.map((v) => v.trim()).find(Boolean);
  return first ?? null;
}

function asList(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((v) => v.trim()).filter(Boolean);
}

/** Parses a list-query `cf` payload. Returns null when nothing should be filtered. */
export function parseCustomFilterQuery(raw: unknown): CustomFilterMap | null {
  if (raw == null || raw === "") return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const out: CustomFilterMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_.]*$/.test(key)) continue;
    if (typeof value === "string") {
      const text = value.trim();
      if (text) out[key] = text;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value);
    } else if (typeof value === "boolean") {
      out[key] = value ? "true" : "false";
    } else if (Array.isArray(value)) {
      const items = value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean);
      if (items.length > 0) out[key] = items;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function none(): Prisma.CustomFieldValueWhereInput {
  return { id: { in: [] } };
}

function dayRange(ymd: string): { gte: Date; lt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

export function customFieldValueWhere(
  type: CustomFieldType,
  value: string | string[],
): Prisma.CustomFieldValueWhereInput | null {
  switch (type) {
    case CustomFieldType.TEXT: {
      const text = asText(value);
      if (!text) return null;
      return { valueString: { contains: text, mode: "insensitive" } };
    }
    case CustomFieldType.NUMBER:
    case CustomFieldType.MONEY: {
      const text = asText(value);
      if (!text) return null;
      const n = Number(text.replace(",", "."));
      if (!Number.isFinite(n)) return none();
      return { valueNumber: n };
    }
    case CustomFieldType.BOOLEAN: {
      const text = asText(value)?.toLowerCase();
      if (!text) return null;
      if (text === "true" || text === "yes" || text === "1") return { valueBoolean: true };
      if (text === "false" || text === "no" || text === "0") return { valueBoolean: false };
      return none();
    }
    case CustomFieldType.DATE: {
      const text = asText(value);
      if (!text) return null;
      const range = dayRange(text.slice(0, 10));
      if (!range) return none();
      return { valueDate: range };
    }
    case CustomFieldType.SELECT:
    case CustomFieldType.USER: {
      const items = asList(value);
      if (items.length === 0) return null;
      if (items.length === 1) return { valueString: items[0] };
      return { valueString: { in: items } };
    }
    case CustomFieldType.MULTISELECT: {
      const items = asList(value);
      if (items.length === 0) return null;
      if (items.length === 1) return { valueJson: { array_contains: items[0] } };
      return { OR: items.map((item) => ({ valueJson: { array_contains: item } })) };
    }
    case CustomFieldType.DICTIONARY_ITEM: {
      const items = asList(value);
      if (items.length === 0) return null;
      if (items.length === 1) return { dictionaryItemId: items[0] };
      return { dictionaryItemId: { in: items } };
    }
    default:
      return null;
  }
}
