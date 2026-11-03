export type CreateWarehouseDto = {
  name: string;
  sortOrder?: number;
  externalCode?: string | null;
  responsibleUserId?: string | null;
};
