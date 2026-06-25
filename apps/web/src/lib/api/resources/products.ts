import { apiHttp } from "../client";

export type StockByWarehouseItem = {
  warehouseId: string;
  warehouseName: string;
  qty: number;
  availableQty?: number;
};

export type ProductCatalogItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  stock: number;
  availableStock?: number;
  showOnStore: boolean;
  primaryImageUrl: string | null;
  primaryImageId: string | null;
  /** Full workbook-style specs JSON (includes internal keys for CRM). */
  characteristics?: Record<string, unknown> | null;
  stockByWarehouse?: StockByWarehouseItem[];
  /** Only present when search returns inactive matches; false = deactivated. */
  isActive?: boolean;
};

export type ProductImageItem = {
  id: string;
  productId: string;
  source: string;
  fileId: string;
  fileName: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductImagesSyncResult = {
  driveItemsTotal: number;
  skippedFolders: number;
  skippedNonImage: number;
  filesProcessed: number;
  productsMatched: number;
  filesUnmatchedNoArticle: number;
  filesUnmatchedNoProduct: number;
  filesUnmatched: number;
  productsWithMultipleImages: number;
  unmatchedNoArticleExamples: string[];
  unmatchedNoProductExamples: string[];
  unmatchedFileNames: string[];
  errors: string[];
};

export type ProductImagesSyncStatus = {
  jobId: string | null;
  running: boolean;
  filesProcessed: number;
  totalFiles: number | null;
  result: ProductImagesSyncResult | null;
  error: string | null;
};

export type ProductsCatalogResponse = {
  items: ProductCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StockUploadResult = {
  updated: number;
  created: number;
  notFound: string[];
  unmatchedWarehouseNames?: string[];
  matchedSkus?: string[];
  unresolvedSkus?: string[];
  skuCorrections?: Array<{ fileSku: string; dbSku: string }>;
};

export type CreateProductPayload = {
  sku: string;
  name?: string;
  unit?: string;
  basePrice?: number;
  showOnStore?: boolean;
};

export type UpdateProductPayload = {
  sku?: string;
  name?: string;
  unit?: string;
  basePrice?: number;
  stock?: number;
  warehouseStocks?: Array<{ warehouseId: string; qty: number }>;
  showOnStore?: boolean;
  isActive?: boolean;
  characteristics?: Record<string, unknown> | null;
};

export const productsApi = {
  createProduct: async (payload: CreateProductPayload): Promise<ProductCatalogItem> => {
    const r = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Create failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
    return r.json() as Promise<ProductCatalogItem>;
  },

  listCatalog: async (params: {
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ProductsCatalogResponse> => {
    const qs = new URLSearchParams();
    qs.set("catalog", "1");
    if (params.search != null && params.search !== "") qs.set("search", params.search);
    if (params.page != null) qs.set("page", String(params.page));
    if (params.pageSize != null) qs.set("pageSize", String(params.pageSize));
    const res = await apiHttp.get<ProductsCatalogResponse>(
      `/products?${qs.toString()}`,
    );
    return res.data;
  },

  updateStock: async (id: string, stock: number): Promise<void> => {
    const r = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock }),
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Update failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
  },

  updateProduct: async (id: string, payload: UpdateProductPayload): Promise<void> => {
    const r = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Update failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
  },

  updateShowOnStore: async (id: string, showOnStore: boolean): Promise<void> => {
    const r = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showOnStore }),
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Update failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
  },

  updateIsActive: async (id: string, isActive: boolean): Promise<void> => {
    const r = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Update failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
  },

  updateCharacteristics: async (
    id: string,
    characteristics: Record<string, unknown> | null,
  ): Promise<void> => {
    const r = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characteristics }),
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Update failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
  },

  deleteProduct: async (id: string): Promise<void> => {
    const r = await fetch(`/api/products/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Delete failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
  },

  listProductImages: async (productId: string): Promise<{ items: ProductImageItem[] }> => {
    const res = await apiHttp.get<{ items: ProductImageItem[] }>(
      `/products/${productId}/images`,
    );
    return res.data;
  },

  setPrimaryProductImage: async (imageId: string): Promise<void> => {
    const res = await apiHttp.post<{ ok: boolean }>(`/products/images/${imageId}/primary`, {});
    if (!res.data?.ok) throw new Error("Failed to set primary image");
  },

  syncProductImagesStart: async (
    folderId?: string,
  ): Promise<{ jobId: string; status: string }> => {
    const res = await apiHttp.post<{ jobId: string; status: string }>(
      "/products/images/sync",
      { folderId: folderId || undefined },
    );
    return res.data;
  },

  getProductImagesSyncStatus: async (): Promise<ProductImagesSyncStatus> => {
    const res = await apiHttp.get<ProductImagesSyncStatus>(
      "/products/images/sync/status",
    );
    return res.data;
  },

  uploadStock: async (file: File): Promise<StockUploadResult> => {
    const formData = new FormData();
    formData.append("file", file);
    // Use fetch so the request is sent as multipart/form-data with boundary.
    // axios defaults to Content-Type: application/json, which prevents the file from being sent.
    const r = await fetch("/api/products/stock/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Upload failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
    return r.json() as Promise<StockUploadResult>;
  },

  uploadStockByWarehouses: async (file: File): Promise<StockUploadResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const r = await fetch("/api/products/stock/upload-by-warehouses", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!r.ok) {
      const errBody = await r.text();
      let message = `Upload failed (${r.status})`;
      try {
        const j = JSON.parse(errBody);
        if (j.message) message = Array.isArray(j.message) ? j.message[0] : j.message;
      } catch {
        if (errBody) message = errBody.slice(0, 200);
      }
      throw new Error(message);
    }
    return r.json() as Promise<StockUploadResult>;
  },
};
