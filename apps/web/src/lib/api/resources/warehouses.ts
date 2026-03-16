import { apiHttp } from "../client";

export type WarehouseItem = {
  id: string;
  name: string;
  sortOrder: number;
};

export async function listWarehouses(): Promise<WarehouseItem[]> {
  const res = await apiHttp.get<WarehouseItem[]>("/warehouses");
  return res.data;
}
