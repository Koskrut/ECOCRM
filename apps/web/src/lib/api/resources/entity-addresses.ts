import { apiHttp } from "../client";

export type EntityAddress = {
  id: string;
  label: string | null;
  city: string | null;
  addressText: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  isDefault: boolean;
  displayLine: string;
  hasCoordinates: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EntityAddressInput = {
  label?: string | null;
  city?: string | null;
  addressText: string;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  isDefault?: boolean;
};

function basePath(entityType: "contact" | "company", entityId: string) {
  return entityType === "contact" ? `/contacts/${entityId}/addresses` : `/companies/${entityId}/addresses`;
}

export const entityAddressesApi = {
  list: async (entityType: "contact" | "company", entityId: string) => {
    const res = await apiHttp.get<{ items: EntityAddress[] }>(basePath(entityType, entityId));
    return res.data.items;
  },

  create: async (entityType: "contact" | "company", entityId: string, body: EntityAddressInput) => {
    const res = await apiHttp.post<EntityAddress>(basePath(entityType, entityId), body);
    return res.data;
  },

  update: async (
    entityType: "contact" | "company",
    entityId: string,
    addressId: string,
    body: Partial<EntityAddressInput>,
  ) => {
    const res = await apiHttp.patch<EntityAddress>(`${basePath(entityType, entityId)}/${addressId}`, body);
    return res.data;
  },

  delete: async (entityType: "contact" | "company", entityId: string, addressId: string) => {
    await apiHttp.delete(`${basePath(entityType, entityId)}/${addressId}`);
  },

  setDefault: async (entityType: "contact" | "company", entityId: string, addressId: string) => {
    const res = await apiHttp.post<EntityAddress>(
      `${basePath(entityType, entityId)}/${addressId}/set-default`,
    );
    return res.data;
  },
};
