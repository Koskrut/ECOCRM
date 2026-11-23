/**
 * Product group IDs aligned with catalog (SKU prefix).
 * Keep ids and names in sync with apps/web/src/lib/product-groups.ts.
 * Slugs and synonyms are the public store map for /systems.
 */
export type CatalogSynonym = {
  /** Short code as it appears on a card or in compatibility_raw. */
  code: string;
  /** Human-readable expansion shown beside the code. The raw value stays unchanged. */
  label: string;
};

export type CatalogSystem = {
  id: string;
  /** Name used in the Ukrainian interface and as the page h1. */
  name: string;
  slug: string;
  synonyms: CatalogSynonym[];
};

export const CATALOG_SYSTEMS: CatalogSystem[] = [
  {
    id: "00",
    name: "Викрутки SUPREX",
    slug: "vykrutky",
    synonyms: [
      { code: "Викрутки SUPREX", label: "Викрутки SUPREX" },
      { code: "викрутки", label: "Викрутки SUPREX" },
    ],
  },
  {
    id: "01",
    name: "Straumann RC",
    slug: "straumann-rc",
    synonyms: [
      { code: "Straumann RC", label: "Straumann RC" },
      { code: "ST RC", label: "Straumann RC" },
    ],
  },
  {
    id: "02",
    name: "Straumann NC",
    slug: "straumann-nc",
    synonyms: [
      { code: "Straumann NC", label: "Straumann NC" },
      { code: "ST NC", label: "Straumann NC" },
    ],
  },
  {
    id: "03",
    name: "MegaGen AnyRidge",
    slug: "megagen-anyridge",
    synonyms: [
      { code: "MegaGen AnyRidge", label: "MegaGen AnyRidge" },
      { code: "AnyRidge", label: "MegaGen AnyRidge" },
      { code: "MG AR", label: "MegaGen AnyRidge" },
    ],
  },
  {
    id: "04",
    name: "MegaGen AnyOne",
    slug: "megagen-anyone",
    synonyms: [
      { code: "MegaGen AnyOne", label: "MegaGen AnyOne" },
      { code: "AnyOne", label: "MegaGen AnyOne" },
      { code: "MG AO", label: "MegaGen AnyOne" },
      { code: "AO", label: "MegaGen AnyOne" },
    ],
  },
  {
    id: "05",
    name: "MIS Seven",
    slug: "mis-seven",
    synonyms: [
      { code: "MIS Seven", label: "MIS Seven" },
      { code: "MIS", label: "MIS Seven" },
    ],
  },
  {
    id: "06",
    name: "ICX",
    slug: "icx",
    synonyms: [{ code: "ICX", label: "ICX" }],
  },
  {
    id: "07",
    name: "Straumann BLX",
    slug: "straumann-blx",
    synonyms: [
      { code: "Straumann BLX", label: "Straumann BLX" },
      { code: "ST BLX", label: "Straumann BLX" },
      { code: "BLX", label: "Straumann BLX" },
    ],
  },
  {
    id: "08",
    name: "NeoDent",
    slug: "neodent",
    synonyms: [
      { code: "NeoDent", label: "NeoDent" },
      { code: "ND", label: "NeoDent" },
    ],
  },
  {
    id: "09",
    name: "Straumann RN",
    slug: "straumann-rn",
    synonyms: [
      { code: "Straumann RN", label: "Straumann RN" },
      { code: "ST RN", label: "Straumann RN" },
    ],
  },
  {
    id: "10",
    name: "OSSTEM Regular",
    slug: "osstem-regular",
    synonyms: [
      { code: "OSSTEM Regular", label: "OSSTEM Regular" },
      { code: "OSSTEM", label: "OSSTEM" },
      { code: "OS", label: "OSSTEM" },
    ],
  },
];

export const PRODUCT_GROUPS: { id: string; name: string }[] = CATALOG_SYSTEMS.map(({ id, name }) => ({
  id,
  name,
}));

/** For backward compatibility: category links use groupId. */
export const STORE_CATEGORIES = PRODUCT_GROUPS;

/** Implant systems for homepage promos (excludes tools group 00). */
export const IMPLANT_SYSTEM_GROUPS = CATALOG_SYSTEMS.filter((system) => system.id !== "00");

export function systemById(id: string | null | undefined): CatalogSystem | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  const padded = /^\d{1,2}$/.test(trimmed) ? trimmed.padStart(2, "0") : trimmed;
  return CATALOG_SYSTEMS.find((system) => system.id === padded || system.id === trimmed);
}

export function systemBySlug(slug: string | null | undefined): CatalogSystem | undefined {
  if (!slug) return undefined;
  const key = slug.trim().toLowerCase();
  return CATALOG_SYSTEMS.find((system) => system.slug === key);
}

/** SKU prefix before the first dot, e.g. "02.104" → Straumann NC. */
export function systemBySku(sku: string | null | undefined): CatalogSystem | undefined {
  if (!sku) return undefined;
  const prefix = sku.trim().split(".")[0] ?? "";
  if (!/^\d{2}$/.test(prefix)) return undefined;
  return systemById(prefix);
}

export function systemPath(system: { slug: string }): string {
  return `/systems/${system.slug}`;
}
