import { apiFetch } from "@/lib/api";

export type Warehouse = {
  id: string;
  name: string;
  sortOrder: number;
  externalCode?: string | null;
};

export const warehousesApi = {
  list: (token: string) => apiFetch<Warehouse[]>("/warehouses", { token }),
};
