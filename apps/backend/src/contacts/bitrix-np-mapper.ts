/**
 * Extract Nova Poshta delivery data from Bitrix contact legacyRaw.
 * Bitrix contact card may have section "НОВАЯ ПОЧТА" with fields:
 * Отримувач (recipient), Телефон отримувача, Місто отримувача, Відділення отримувача.
 * Custom field keys are usually UF_CRM_* (numeric ID); we support known IDs and key substrings.
 */

/** Known Bitrix CRM contact field IDs for NP. */
const BITRIX_NP_FIELD_IDS: Record<
  string,
  "recipient" | "phone" | "city" | "warehouse" | "street" | "building" | "recipientFio"
> = {
  UF_CRM_1754038473303: "recipient", // Отримувач
  UF_CRM_1754057833894: "phone", // Телефон отримувача
  UF_CRM_1754036730674: "city", // Місто отримувача
  UF_CRM_1754036550992: "warehouse", // Відділення отримувача
  UF_CRM_1754036559827: "street", // Вулиця отримувача
  UF_CRM_1754036573507: "building", // Будинок отримувача
  UF_CRM_1754057393851: "recipientFio", // ФІО (запасний отримувач)
};

export type BitrixNpProfileData = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  cityName: string | null;
  warehouseNumber: string | null;
  warehouseAddress: string | null;
  streetName: string | null;
  building: string | null;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/** Reject values that are clearly not phone numbers (e.g. Bitrix checkbox "Y"/"N"). */
function isReasonablePhone(v: string): boolean {
  if (!v || v.length < 5) return false;
  const lower = v.toLowerCase();
  if (["y", "n", "yes", "no", "1", "0", "true", "false"].includes(lower)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 5;
}

/** Reject checkbox-like or too short values for name/city/warehouse. */
function isSubstantialValue(v: string): boolean {
  if (!v || v.length < 2) return false;
  const lower = v.toLowerCase();
  return !["y", "n", "yes", "no", "1", "0", "true", "false"].includes(lower);
}

/** Parse "Відділення №109 (до 30 кг...): вул. Кирилівська, 15" → { number: "109", address: full } */
function parseWarehouseText(text: string | null): { number: string | null; address: string | null } {
  if (!text || !text.trim()) return { number: null, address: null };
  const t = text.trim();
  const numberMatch = t.match(/№\s*(\d+)/i) ?? t.match(/number\s*(\d+)/i) ?? t.match(/(\d+)\s*\(/);
  const number = numberMatch ? numberMatch[1]! : null;
  return { number, address: t || null };
}

/** Split full name "Скібіцький Олександр" or "LastName FirstName" into lastName, firstName */
function splitFullName(full: string | null): { firstName: string | null; lastName: string | null } {
  if (!full || !full.trim()) return { firstName: null, lastName: null };
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  const lastName = parts[0]!;
  const firstName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

/**
 * Extract NP-related fields from Bitrix contact legacyRaw (raw row from b_crm_contact or REST).
 * Tries common UF_CRM_* keys and any key containing recipient/phone/city/warehouse (case-insensitive).
 */
export function extractNpDataFromBitrixLegacyRaw(
  legacyRaw: Record<string, unknown> | null | undefined,
): BitrixNpProfileData | null {
  if (!legacyRaw || typeof legacyRaw !== "object") return null;

  let recipientName: string | null = null;
  let phone: string | null = null;
  let city: string | null = null;
  let warehouse: string | null = null;
  let street: string | null = null;
  let building: string | null = null;
  let recipientFio: string | null = null;

  for (const [key, value] of Object.entries(legacyRaw)) {
    const v = str(value);
    if (!v) continue;
    const known = BITRIX_NP_FIELD_IDS[key];
    if (known === "recipient" && isSubstantialValue(v)) {
      recipientName = v;
      continue;
    }
    if (known === "phone" && isReasonablePhone(v)) {
      phone = v;
      continue;
    }
    if (known === "city" && isSubstantialValue(v)) {
      city = v;
      continue;
    }
    if (known === "warehouse" && isSubstantialValue(v)) {
      warehouse = v;
      continue;
    }
    if (known === "street" && isSubstantialValue(v)) {
      street = v;
      continue;
    }
    if (known === "building" && isSubstantialValue(v)) {
      building = v;
      continue;
    }
    if (known === "recipientFio" && isSubstantialValue(v)) {
      recipientFio = v;
      continue;
    }
    const k = key.toUpperCase();
    if (
      (k.includes("RECIPIENT") || k.includes("ОТРИМУВАЧ")) &&
      !k.includes("PHONE") &&
      !k.includes("ТЕЛЕФОН") &&
      isSubstantialValue(v)
    ) {
      recipientName = v;
    } else if (
      (k.includes("PHONE") ||
        k.includes("ТЕЛЕФОН") ||
        (k.includes("RECIPIENT") && k.includes("PHONE"))) &&
      isReasonablePhone(v)
    ) {
      phone = v;
    } else if (
      (k.includes("CITY") || k.includes("МІСТО") || k.includes("CITY_NAME")) &&
      isSubstantialValue(v)
    ) {
      city = v;
    } else if (
      (k.includes("WAREHOUSE") ||
        k.includes("ВІДДІЛЕННЯ") ||
        k.includes("BRANCH") ||
        (k.includes("NP_") && (k.includes("ADDR") || k.includes("WAREHOUSE") || k.includes("NUM")))) &&
      isSubstantialValue(v)
    ) {
      warehouse = v;
    }
  }

  const nameForRecipient = recipientName || recipientFio;
  const hasAny = nameForRecipient || phone || city || warehouse || street || building;
  if (!hasAny) return null;

  const { firstName, lastName } = splitFullName(nameForRecipient);
  const { number: warehouseNumber, address: warehouseAddress } = parseWarehouseText(warehouse);

  return {
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    phone: phone ?? null,
    cityName: city ?? null,
    warehouseNumber: warehouseNumber ?? null,
    warehouseAddress: warehouseAddress ?? null,
    streetName: street ?? null,
    building: building ?? null,
  };
}

/**
 * Build ContactShippingProfile create payload from Bitrix NP data.
 * Default: PERSON, WAREHOUSE (доставка у відділення), label "Нова Пошта (Bitrix)".
 */
export function bitrixNpDataToProfilePayload(
  data: BitrixNpProfileData,
  label = "Нова Пошта (Bitrix)",
): Record<string, unknown> {
  return {
    label,
    isDefault: false,
    recipientType: "PERSON",
    deliveryType: "WAREHOUSE",
    firstName: data.firstName ?? undefined,
    lastName: data.lastName ?? undefined,
    phone: data.phone ?? undefined,
    cityName: data.cityName ?? undefined,
    warehouseNumber: data.warehouseNumber ?? undefined,
    streetName: data.streetName ?? data.warehouseAddress ?? undefined,
    building: data.building ?? undefined,
  };
}
