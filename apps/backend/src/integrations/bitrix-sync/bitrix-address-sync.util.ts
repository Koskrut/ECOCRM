import type { PrismaClient } from "@prisma/client";
import { contactDenormalizedFromDefault, companyDenormalizedFromDefault } from "../../common/entity-address.util";

const LEGACY_SOURCE = "bitrix";

export type BitrixAddressDraft = {
  label: string | null;
  city: string | null;
  addressText: string;
  isDefault: boolean;
  legacyId: number;
  legacyRaw: Record<string, unknown>;
};

export function mapBitrixPrimaryContactAddress(row: Record<string, unknown>): BitrixAddressDraft | null {
  const bitrixId = Number(row["ID"]);
  if (!bitrixId) return null;

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

  const cityFromUf =
    row["UF_CRM_1753079682882"] != null && String(row["UF_CRM_1753079682882"]).trim() !== ""
      ? String(row["UF_CRM_1753079682882"]).trim()
      : null;
  const cityFromAddress = row["ADDRESS_CITY"] != null ? String(row["ADDRESS_CITY"]).trim() : null;
  const city = cityFromUf || cityFromAddress || null;

  const line1 = row["ADDRESS"] != null ? String(row["ADDRESS"]).trim() : "";
  const addressText =
    line1 ||
    (addressParts.length > 0 ? addressParts.join(", ") : "") ||
    city ||
    "";

  if (!addressText.trim()) return null;

  return {
    label: null,
    city,
    addressText: addressText.trim(),
    isDefault: true,
    legacyId: -bitrixId,
    legacyRaw: { source: "primary", bitrixId },
  };
}

export function mapBitrixFieldMultiAddressRow(
  elementLegacyId: number,
  row: Record<string, unknown>,
): BitrixAddressDraft | null {
  const legacyId = Number(row["ID"]);
  const value = row["VALUE"] != null ? String(row["VALUE"]).trim() : "";
  if (!legacyId || !value) return null;
  const label =
    row["VALUE_TYPE"] != null && String(row["VALUE_TYPE"]).trim() !== ""
      ? String(row["VALUE_TYPE"]).trim()
      : null;
  return {
    label,
    city: null,
    addressText: value,
    isDefault: false,
    legacyId,
    legacyRaw: { source: "field_multi", elementLegacyId, row },
  };
}

export function mapBitrixPrimaryCompanyAddress(row: Record<string, unknown>): BitrixAddressDraft | null {
  const bitrixId = Number(row["ID"]);
  if (!bitrixId) return null;
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
  const addressText = addressParts.join(", ").trim();
  if (!addressText) return null;
  const city = row["ADDRESS_CITY"] != null ? String(row["ADDRESS_CITY"]).trim() : null;
  return {
    label: null,
    city: city || null,
    addressText,
    isDefault: true,
    legacyId: -bitrixId,
    legacyRaw: { source: "primary", bitrixId },
  };
}

async function upsertContactAddressDrafts(
  prisma: PrismaClient,
  contactId: string,
  drafts: BitrixAddressDraft[],
) {
  if (drafts.length === 0) return;

  let hasDefault = false;
  for (const draft of drafts) {
    const isDefault = draft.isDefault && !hasDefault;
    if (isDefault) hasDefault = true;
    await prisma.contactAddress.upsert({
      where: {
        legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: draft.legacyId },
      },
      create: {
        contactId,
        label: draft.label,
        city: draft.city,
        addressText: draft.addressText,
        isDefault,
        legacySource: LEGACY_SOURCE,
        legacyId: draft.legacyId,
        legacyRaw: draft.legacyRaw as object,
        syncedAt: new Date(),
      },
      update: {
        label: draft.label,
        city: draft.city,
        addressText: draft.addressText,
        isDefault,
        legacyRaw: draft.legacyRaw as object,
        syncedAt: new Date(),
      },
    });
  }

  if (!hasDefault) {
    const first = await prisma.contactAddress.findFirst({
      where: { contactId },
      orderBy: { createdAt: "asc" },
    });
    if (first) {
      await prisma.contactAddress.update({
        where: { id: first.id },
        data: { isDefault: true },
      });
    }
  }

  const defaultAddress = await prisma.contactAddress.findFirst({
    where: { contactId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  await prisma.contact.update({
    where: { id: contactId },
    data: contactDenormalizedFromDefault(defaultAddress),
  });
}

async function upsertCompanyAddressDrafts(
  prisma: PrismaClient,
  companyId: string,
  drafts: BitrixAddressDraft[],
) {
  if (drafts.length === 0) return;

  let hasDefault = false;
  for (const draft of drafts) {
    const isDefault = draft.isDefault && !hasDefault;
    if (isDefault) hasDefault = true;
    await prisma.companyAddress.upsert({
      where: {
        legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: draft.legacyId },
      },
      create: {
        companyId,
        label: draft.label,
        city: draft.city,
        addressText: draft.addressText,
        isDefault,
        legacySource: LEGACY_SOURCE,
        legacyId: draft.legacyId,
        legacyRaw: draft.legacyRaw as object,
        syncedAt: new Date(),
      },
      update: {
        label: draft.label,
        city: draft.city,
        addressText: draft.addressText,
        isDefault,
        legacyRaw: draft.legacyRaw as object,
        syncedAt: new Date(),
      },
    });
  }

  const defaultAddress = await prisma.companyAddress.findFirst({
    where: { companyId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  await prisma.company.update({
    where: { id: companyId },
    data: companyDenormalizedFromDefault(defaultAddress),
  });
}

export async function syncContactAddressesFromBitrixRow(
  prisma: PrismaClient,
  contactId: string,
  row: Record<string, unknown>,
  multiAddressRows: Record<string, unknown>[] = [],
) {
  const drafts: BitrixAddressDraft[] = [];
  const primary = mapBitrixPrimaryContactAddress(row);
  if (primary) drafts.push(primary);
  for (const multi of multiAddressRows) {
    const bitrixId = Number(row["ID"]);
    const mapped = mapBitrixFieldMultiAddressRow(bitrixId, multi);
    if (mapped) drafts.push(mapped);
  }
  await upsertContactAddressDrafts(prisma, contactId, drafts);
}

export async function syncCompanyAddressesFromBitrixRow(
  prisma: PrismaClient,
  companyId: string,
  row: Record<string, unknown>,
) {
  const primary = mapBitrixPrimaryCompanyAddress(row);
  await upsertCompanyAddressDrafts(prisma, companyId, primary ? [primary] : []);
}
