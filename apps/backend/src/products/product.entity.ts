export type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  stock: number;
  isActive: boolean;
  primaryImageId?: string | null;
  primaryImageUrl?: string | null; // direct URL; use primaryImageId + proxy for Drive
  createdAt: string;
  updatedAt: string;
};
