/**
 * Product group IDs aligned with catalog (SKU prefix). Used for store category filter and display.
 * Keep in sync with apps/web/src/lib/product-groups.ts.
 */
export const PRODUCT_GROUPS: { id: string; name: string }[] = [
  { id: "00", name: "Викрутки SUPREX" },
  { id: "01", name: "Straumann RC" },
  { id: "02", name: "Straumann NC" },
  { id: "03", name: "MegaGen AnyRidge" },
  { id: "04", name: "MegaGen AnyOne" },
  { id: "05", name: "MIS Seven" },
  { id: "06", name: "ICX" },
  { id: "07", name: "Straumann BLX" },
  { id: "08", name: "NeoDent" },
  { id: "09", name: "Straumann RN" },
  { id: "10", name: "OSSTEM Regular" },
];

/** For backward compatibility: category links use groupId. */
export const STORE_CATEGORIES = PRODUCT_GROUPS;

/** Implant systems for homepage promos (excludes tools group 00). */
export const IMPLANT_SYSTEM_GROUPS = PRODUCT_GROUPS.filter((g) => g.id !== "00");
