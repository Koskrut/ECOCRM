import type { DeliveryMethod, OrderStatus, PaymentMethod, UserRole } from "@prisma/client";

/** Normalize phone to digits-only for phoneNormalized. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (phone == null || typeof phone !== "string") return "";
  return phone.replace(/\D/g, "");
}

/** Extract first phone/email from Bitrix REST item (may be array of { VALUE }). */
export function firstPhoneFromRest(item: Record<string, unknown>): string {
  const ph = item["PHONE"];
  if (Array.isArray(ph) && ph.length > 0) {
    const v = (ph[0] as { VALUE?: string })?.VALUE ?? ph[0];
    return typeof v === "string" ? v : "";
  }
  if (typeof ph === "string") return ph;
  return "";
}

export function firstEmailFromRest(item: Record<string, unknown>): string | null {
  const em = item["EMAIL"];
  if (Array.isArray(em) && em.length > 0) {
    const v = (em[0] as { VALUE?: string })?.VALUE ?? em[0];
    return typeof v === "string" ? v : null;
  }
  if (typeof em === "string") return em;
  return null;
}

/** Bitrix b_user row (MySQL) → Prisma User create/update. */
export function mapBitrixUserToPrisma(row: Record<string, unknown>): {
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
} {
  const id = Number(row["ID"]);
  const name = String(row["NAME"] ?? "").trim();
  const lastName = String(row["LAST_NAME"] ?? "").trim();
  const email = String(row["EMAIL"] ?? "").trim() || `bitrix-user-${id}@legacy.local`;
  const fullName = [name, lastName].filter(Boolean).join(" ") || email;

  return {
    email,
    fullName,
    passwordHash: "", // Bitrix users cannot login via ECOCRM password; use placeholder
    role: "MANAGER",
    legacySource: "bitrix",
    legacyId: id,
    legacyRaw: row as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

/** Bitrix b_crm_company row → Prisma Company. */
export function mapBitrixCompanyToPrisma(row: Record<string, unknown>): {
  name: string;
  edrpou: string | null;
  taxId: string | null;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
} {
  const id = Number(row["ID"]);
  const title = String(row["TITLE"] ?? row["COMPANY_TITLE"] ?? "").trim() || `Company ${id}`;
  const edrpou = row["UF_CRM_EDRPOU"] != null ? String(row["UF_CRM_EDRPOU"]).trim() : null;
  const taxId = row["UF_CRM_INN"] != null ? String(row["UF_CRM_INN"]).trim() : null;

  return {
    name: title,
    edrpou: edrpou || null,
    taxId: taxId || null,
    legacySource: "bitrix",
    legacyId: id,
    legacyRaw: row as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

/** Bitrix b_crm_contact row + optional first phone/email from field_multi. */
export function mapBitrixContactToPrisma(
  row: Record<string, unknown>,
  primaryPhone: string,
  primaryEmail: string | null,
): {
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string;
  phoneNormalized: string | null;
  email: string | null;
  position: string | null;
  address: string | null;
  externalCode: string | null;
  region: string | null;
  addressInfo: string | null;
  city: string | null;
  clientType: string | null;
  ownerId: string | null;
  companyId: string | null;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
} {
  const id = Number(row["ID"]);
  const name = String(row["NAME"] ?? "").trim();
  const lastName = String(row["LAST_NAME"] ?? "").trim();
  const secondName = String(row["SECOND_NAME"] ?? "").trim() || null;
  const post = row["POST"] != null ? String(row["POST"]).trim() : null;
  const comments = row["COMMENTS"] != null ? String(row["COMMENTS"]).trim() : null;
  const address = comments || null;
  // Bitrix REST may return ADDRESS or structured ADDRESS_*; build addressInfo from any available
  const addressParts = [
    row["ADDRESS"],
    row["ADDRESS_2"],
    row["ADDRESS_CITY"],
    row["ADDRESS_REGION"],
    row["ADDRESS_PROVINCE"],
    row["ADDRESS_POSTAL_CODE"],
    row["ADDRESS_COUNTRY"],
  ]
    .filter((v) => v != null && String(v).trim() !== "")
    .map((v) => String(v).trim());
  const addressInfoFromRest = addressParts.length > 0 ? addressParts.join(", ") : null;
  const externalCode =
    row["UF_CRM_1772007718612"] != null && String(row["UF_CRM_1772007718612"]).trim() !== ""
      ? String(row["UF_CRM_1772007718612"]).trim()
      : null;
  const regionPrimary =
    row["UF_CRM_1753079162490"] != null && String(row["UF_CRM_1753079162490"]).trim() !== ""
      ? String(row["UF_CRM_1753079162490"]).trim()
      : null;
  const regionFallback =
    row["UF_CRM_1753079192866"] != null && String(row["UF_CRM_1753079192866"]).trim() !== ""
      ? String(row["UF_CRM_1753079192866"]).trim()
      : null;
  const region = regionPrimary ?? regionFallback ?? null;
  const addressInfo =
    row["ADDRESS"] != null && String(row["ADDRESS"]).trim() !== ""
      ? String(row["ADDRESS"]).trim()
      : addressInfoFromRest;
  const city =
    row["UF_CRM_1753079682882"] != null && String(row["UF_CRM_1753079682882"]).trim() !== ""
      ? String(row["UF_CRM_1753079682882"]).trim()
      : null;
  const clientType =
    row["UF_CRM_1756361960817"] != null && String(row["UF_CRM_1756361960817"]).trim() !== ""
      ? String(row["UF_CRM_1756361960817"]).trim()
      : null;

  return {
    firstName: name || "—",
    lastName: lastName || "—",
    middleName: secondName,
    phone: primaryPhone || "—",
    phoneNormalized: primaryPhone ? normalizePhoneDigits(primaryPhone) || null : null,
    email: primaryEmail || null,
    position: post,
    address,
    externalCode: externalCode || null,
    region,
    addressInfo,
    city,
    clientType,
    ownerId: null,
    companyId: null,
    legacySource: "bitrix",
    legacyId: id,
    legacyRaw: row as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

/** Single phone from b_crm_field_multi → ContactPhone. */
export function mapBitrixFieldMultiPhoneToContactPhone(
  elementId: number,
  value: string,
  typeId: string,
  legacyRowId: number,
): {
  contactId: string;
  phone: string;
  phoneNormalized: string;
  label: string | null;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
} {
  const normalized = normalizePhoneDigits(value);
  return {
    contactId: "", // filled by import service with resolved contact id
    phone: value,
    phoneNormalized: normalized || value,
    label: typeId === "PHONE" ? null : typeId,
    legacySource: "bitrix",
    legacyId: legacyRowId,
    legacyRaw: { elementId, value, typeId },
    syncedAt: new Date(),
  };
}

/** Bitrix b_crm_lead row → Prisma Lead. */
export function mapBitrixLeadToPrisma(
  row: Record<string, unknown>,
  companyId: string,
  contactId: string | null,
  ownerId: string | null,
): {
  companyId: string;
  contactId: string | null;
  ownerId: string | null;
  status: "NEW" | "IN_PROGRESS" | "WON" | "LOST" | "NOT_TARGET" | "SPAM";
  source: "OTHER";
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  companyName: string | null;
  message: string | null;
  comment: string | null;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
} {
  const id = Number(row["ID"]);
  const title = String(row["TITLE"] ?? "").trim() || null;
  const name = String(row["NAME"] ?? "").trim() || null;
  const lastName = String(row["LAST_NAME"] ?? "").trim() || null;
  const statusId = String(row["STATUS_ID"] ?? "NEW");
  const phone = row["PHONE"] != null ? String((row["PHONE"] as { VALUE?: string })?.VALUE ?? row["PHONE"]) : null;
  const email = row["EMAIL"] != null ? String((row["EMAIL"] as { VALUE?: string })?.VALUE ?? row["EMAIL"]) : null;
  const comments = row["COMMENTS"] != null ? String(row["COMMENTS"]).trim() : null;

  const status = mapBitrixLeadStatusToPrisma(statusId);

  return {
    companyId,
    contactId,
    ownerId,
    status,
    source: "OTHER",
    name: title,
    firstName: name,
    lastName,
    fullName: [name, lastName].filter(Boolean).join(" ") || title,
    phone: phone || null,
    phoneNormalized: phone ? normalizePhoneDigits(phone) : null,
    email: email || null,
    companyName: null,
    message: null,
    comment: comments,
    legacySource: "bitrix",
    legacyId: id,
    legacyRaw: row as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

function mapBitrixLeadStatusToPrisma(
  statusId: string,
): "NEW" | "IN_PROGRESS" | "WON" | "LOST" | "NOT_TARGET" | "SPAM" {
  const s = statusId.toUpperCase();
  if (s === "CONVERTED" || s === "WON") return "WON";
  if (s === "LOST" || s === "FAILED") return "LOST";
  if (s === "NEW") return "NEW";
  if (s === "IN_PROCESS" || s === "IN_PROGRESS") return "IN_PROGRESS";
  return "IN_PROGRESS";
}

/** Normalize list/object value from Bitrix (REST may return { ID, VALUE } or array of such). */
function normalizeBitrixListValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (first != null && typeof first === "object" && "VALUE" in first) return String((first as { VALUE?: unknown }).VALUE ?? "").trim() || null;
    if (first != null && typeof first === "object" && "ID" in first) return String((first as { ID?: unknown }).ID ?? "").trim() || null;
    return String(first).trim() || null;
  }
  if (typeof value === "object" && value !== null && "VALUE" in value) return String((value as { VALUE?: unknown }).VALUE ?? "").trim() || null;
  if (typeof value === "object" && value !== null && "ID" in value) return String((value as { ID?: unknown }).ID ?? "").trim() || null;
  return String(value).trim() || null;
}

/** Bitrix UF_CRM_1753787869056 (cash/FOP) → PaymentMethod. List options may be stored as ID "1"/"2". */
export function mapBitrixPaymentMethodToPrisma(
  value: unknown,
): PaymentMethod | null {
  const raw = normalizeBitrixListValue(value);
  const v = (raw ?? "").toLowerCase();
  if (!v) return null;
  if (v === "cash" || v === "готівка" || v === "готівку" || v === "наличные" || v === "1") return "CASH";
  if (v === "fop" || v === "фоп" || v === "бн" || v === "безготівка" || v === "безнал" || v === "безналичные" || v === "2") return "FOP";
  return null;
}

/** Bitrix UF_CRM_1753788124915 (Документы) — list/single "1"|"0"|"2" or "Да"|"Нет" → boolean. List ID: 1=Да, 2=Нет. */
export function mapBitrixDocumentsToPrisma(value: unknown): boolean | null {
  const raw = normalizeBitrixListValue(value);
  const v = (raw ?? "").toLowerCase();
  if (!v) return null;
  if (v === "1" || v === "y" || v === "yes" || v === "да" || v === "так" || v === "true") return true;
  if (v === "0" || v === "2" || v === "n" || v === "no" || v === "нет" || v === "нi" || v === "false") return false;
  return null;
}

/**
 * Bitrix b_crm_deal STAGE_ID + STAGE_SEMANTIC_ID → OrderStatus.
 * STAGE_ID may be "C4:1" (pipeline:stage); we use the part after ":" for matching.
 * Mapping: NEW→NEW, UC_A7MKDG→IN_WORK, PREPAYMENT_INVOICE→READY_TO_SHIP, 1→SHIPPED, 2→CONTROL_PAYMENT, 3→SUCCESS, WON→SUCCESS, LOSE→CANCELED.
 */
export function mapBitrixDealStageToOrderStatus(
  stageId: string | null | undefined,
  stageSemanticId?: string | null,
): OrderStatus {
  const semantic = stageSemanticId != null ? String(stageSemanticId).toUpperCase().trim() : "";
  if (semantic === "S") return "SUCCESS";
  if (semantic === "L" || semantic === "F") return "CANCELED";
  if (!stageId) return "NEW";
  const raw = String(stageId).trim();
  const s = raw.includes(":") ? (raw.split(":").pop() ?? raw).trim() : raw;
  const u = s.toUpperCase();
  if (u === "NEW") return "NEW";
  if (u === "UC_A7MKDG") return "IN_WORK";
  if (u === "PREPAYMENT_INVOICE") return "READY_TO_SHIP";
  if (s === "1" || u === "1") return "SHIPPED";
  if (s === "2" || u === "2") return "CONTROL_PAYMENT";
  if (s === "3" || u === "3") return "SUCCESS";
  if (u === "WON" || u.includes("WON")) return "SUCCESS";
  if (u === "LOSE" || u.includes("LOSE") || u.includes("LOST")) return "CANCELED";
  return "NEW";
}

/** Parse Bitrix date string (e.g. "2024-01-15T12:30:00+03:00") to Date; returns null if invalid. */
export function parseBitrixDate(value: unknown): Date | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Bitrix b_crm_deal row → Prisma Order (+ ttnNumber for ensureOrderTtnFromBitrix). */
export function mapBitrixDealToPrisma(
  row: Record<string, unknown>,
  companyId: string | null,
  clientId: string | null,
  contactId: string | null,
  ownerId: string,
  orderNumber: string,
): {
  orderNumber: string;
  companyId: string | null;
  clientId: string | null;
  contactId: string | null;
  ownerId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  documentsRequested: boolean | null;
  deliveryMethod: DeliveryMethod | null;
  ttnNumber: string | null;
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  comment: string | null;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
} {
  const id = Number(row["ID"]);
  const opportunity = Number(row["OPPORTUNITY"]) || 0;
  const currencyId = String(row["CURRENCY_ID"] ?? "UAH").trim();
  const stageId = row["STAGE_ID"] != null ? String(row["STAGE_ID"]) : null;
  const stageSemanticId = row["STAGE_SEMANTIC_ID"] != null ? String(row["STAGE_SEMANTIC_ID"]) : null;
  const comments = row["COMMENTS"] != null ? String(row["COMMENTS"]).trim() : null;
  const paymentMethod = mapBitrixPaymentMethodToPrisma(row["UF_CRM_1753787869056"]);
  const documentsRequested = mapBitrixDocumentsToPrisma(row["UF_CRM_1753788124915"]);
  const ttnRaw = row["UF_CRM_TTN_NUMBER"];
  const ttnNumber =
    ttnRaw != null && String(ttnRaw).trim() !== "" ? String(ttnRaw).trim() : null;
  const deliveryMethod: DeliveryMethod | null = ttnNumber ? "NOVA_POSHTA" : null;
  const now = new Date();
  const createdAt = parseBitrixDate(row["DATE_CREATE"]) ?? now;
  const updatedAt = parseBitrixDate(row["DATE_MODIFY"]) ?? createdAt;

  return {
    orderNumber,
    companyId,
    clientId,
    contactId,
    ownerId,
    status: mapBitrixDealStageToOrderStatus(stageId, stageSemanticId),
    paymentMethod,
    documentsRequested,
    deliveryMethod,
    ttnNumber,
    currency: currencyId,
    subtotalAmount: opportunity,
    discountAmount: 0,
    totalAmount: opportunity,
    paidAmount: 0,
    debtAmount: opportunity,
    comment: comments,
    legacySource: "bitrix",
    legacyId: id,
    legacyRaw: row as Record<string, unknown>,
    syncedAt: now,
    createdAt,
    updatedAt,
  };
}

/**
 * Parse Bitrix product name: "123.45 | Product name" → { sku: "123.45", namePart: "Product name" }.
 * In Bitrix the article (артикул) is stored as digits with dot before "|".
 */
export function parseBitrixProductNameForSku(productName: string | null | undefined): {
  sku: string | null;
  namePart: string;
} {
  const raw = productName != null ? String(productName).trim() : "";
  if (!raw) return { sku: null, namePart: "" };
  const match = raw.match(/^\s*([0-9]+(?:\.[0-9]+)*)\s*\|\s*(.*)$/);
  if (match) {
    const sku = match[1].trim();
    const namePart = (match[2] ?? "").trim();
    return { sku: sku || null, namePart: namePart || raw };
  }
  return { sku: null, namePart: raw };
}

/** Bitrix b_crm_product_row → Prisma OrderItem (with or without productId). */
export function mapBitrixProductRowToPrisma(
  row: Record<string, unknown>,
  orderId: string,
  productId: string | null,
  productNameSnapshot: string | null,
): {
  orderId: string;
  productId: string | null;
  productNameSnapshot: string | null;
  qty: number;
  price: number;
  lineTotal: number;
  legacySource: string;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
  syncedAt: Date;
} {
  const id = Number(row["ID"]);
  const qty = Number(row["QUANTITY"]) || 1;
  const price = Number(row["PRICE"]) || 0;
  const lineTotal = Number(row["PRICE_BRUTTO"] ?? row["PRICE"]) * qty || price * qty;
  const name = row["PRODUCT_NAME"] != null ? String(row["PRODUCT_NAME"]).trim() : productNameSnapshot;

  return {
    orderId,
    productId,
    productNameSnapshot: name,
    qty,
    price,
    lineTotal,
    legacySource: "bitrix",
    legacyId: id,
    legacyRaw: row as Record<string, unknown>,
    syncedAt: new Date(),
  };
}
