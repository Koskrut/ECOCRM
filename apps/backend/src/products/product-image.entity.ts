export type ProductImageSource = "google_drive";

export type ProductImage = {
  id: string;
  productId: string;
  source: ProductImageSource;
  fileId: string;
  fileName: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};
