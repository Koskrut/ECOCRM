export type Product = {
  id: string;
  sku: string;
  /** Код номенклатуры в 1С. */
  externalCode: string | null;
  name: string;
  unit: string;
  basePrice: number;
  stock: number;
  /** KIT = sales catalog; PART = BOM/factory materials (not catalog). */
  kind: "KIT" | "PART" | "OTHER";
  isActive: boolean;
  showOnStore: boolean;
  /** Structured specs; keys match workbook attribute_code (e.g. compatibility_raw, diameter). */
  characteristics?: Record<string, unknown> | null;
  primaryImageId?: string | null;
  primaryImageUrl?: string | null; // direct URL; use primaryImageId + proxy for Drive
  createdAt: string;
  updatedAt: string;
};
