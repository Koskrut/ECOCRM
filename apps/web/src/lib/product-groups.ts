/**
 * Product group IDs (SKU prefix) → display name. Aligned with store catalog.
 */
export const PRODUCT_GROUP_NAMES: Record<string, string> = {
  "00": "Викрутки SUPREX",
  "01": "Straumann RC",
  "02": "Straumann NC",
  "03": "MegaGen AnyRidge",
  "04": "MegaGen AnyOne",
  "05": "MIS Seven",
  "06": "ICX",
  "07": "Straumann BLX",
  "08": "NeoDent Regular",
  "09": "Straumann RN",
  "10": "OSSTEM Regular",
};

export function productGroupNameFromSku(sku: string): string {
  const s = sku.trim();
  const prefix = s.length >= 2 ? s.slice(0, 2) : s || "";
  return PRODUCT_GROUP_NAMES[prefix] ?? (prefix || "—");
}
