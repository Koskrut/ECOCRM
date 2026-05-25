import { apiHttp } from "../client";

export type WarehouseItem = {
  id: string;
  name: string;
  sortOrder: number;
  externalCode?: string | null;
};

export type CreateWarehousePayload = {
  name: string;
  sortOrder?: number;
  externalCode?: string | null;
};

export type UpdateWarehousePayload = {
  name?: string;
  sortOrder?: number;
  externalCode?: string | null;
};

export async function listWarehouses(): Promise<WarehouseItem[]> {
  const res = await apiHttp.get<WarehouseItem[]>("/warehouses");
  return res.data;
}

export async function createWarehouse(
  payload: CreateWarehousePayload,
): Promise<WarehouseItem> {
  const res = await apiHttp.post<WarehouseItem>("/warehouses", payload);
  return res.data;
}

export async function updateWarehouse(
  id: string,
  payload: UpdateWarehousePayload,
): Promise<WarehouseItem> {
  const res = await apiHttp.patch<WarehouseItem>(`/warehouses/${id}`, payload);
  return res.data;
}

export async function deleteWarehouse(id: string): Promise<void> {
  await apiHttp.delete(`/warehouses/${id}`);
}
