export type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  stock: number;
  isActive: boolean;
  showOnStore: boolean;
  /** Structured specs; keys match workbook attribute_code (e.g. compatibility_raw, diameter). */
  characteristics?: Record<string, unknown> | null;
  primaryImageId?: string | null;
  primaryImageUrl?: string | null; // direct URL; use primaryImageId + proxy for Drive
  createdAt: string;
  updatedAt: string;
};
