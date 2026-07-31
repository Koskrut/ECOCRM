import { apiHttp } from "../client";

export type ReturnPackageStatus = "IN_TRANSIT_BACK" | "RECEIVED_BY_WAREHOUSE";

export type ReturnPackageReturnItem = {
  id: string;
  orderItemId: string;
  qtyReturned: number;
  disposition?: string;
  actualProductId?: string | null;
  actualProduct?: { id: string; name: string; sku: string | null } | null;
  orderItem?: {
    id: string;
    qty: number;
    price: number;
    lineTotal: number;
    productNameSnapshot?: string | null;
    product?: { id: string; name: string; sku: string | null } | null;
  };
};

export type ReturnPackageLinkedReturn = {
  id: string;
  orderId: string;
  status: string;
  reason?: string;
  itemsPending: boolean;
  items: ReturnPackageReturnItem[];
  order: {
    id: string;
    orderNumber: string;
    orderStage?: string | null;
    client?: { id: string; firstName: string; lastName: string } | null;
    company?: { id: string; name: string } | null;
  };
};

export type ReturnPackage = {
  id: string;
  ttnNumber: string;
  carrier: string;
  ttnStatusCode?: string | null;
  ttnStatusText?: string | null;
  ttnSyncedAt?: string | null;
  contactId?: string | null;
  note?: string | null;
  status: ReturnPackageStatus;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  returns: ReturnPackageLinkedReturn[];
};

export const returnPackagesApi = {
  listWarehouseQueue: async () => {
    const res = await apiHttp.get<{ items: ReturnPackage[] }>(
      "/return-packages/warehouse-queue",
    );
    return res.data ?? { items: [] };
  },

  getById: async (id: string) => {
    const res = await apiHttp.get<ReturnPackage>(`/return-packages/${id}`);
    return res.data;
  },

  create: async (body: {
    ttnNumber: string;
    contactId?: string;
    orderId?: string;
    note?: string;
    itemsPending?: boolean;
    items?: Array<{ orderItemId: string; qtyReturned: number }>;
  }) => {
    const res = await apiHttp.post<ReturnPackage>("/return-packages", body);
    return res.data;
  },

  receive: async (id: string) => {
    const res = await apiHttp.post<ReturnPackage>(`/return-packages/${id}/receive`, {});
    return res.data;
  },

  addItems: async (
    id: string,
    body: {
      orderId: string;
      items: Array<{ orderItemId: string; qtyReturned: number }>;
    },
  ) => {
    const res = await apiHttp.post<ReturnPackage>(`/return-packages/${id}/items`, body);
    return res.data;
  },

  completeInspection: async (id: string) => {
    const res = await apiHttp.post<ReturnPackage>(
      `/return-packages/${id}/complete-inspection`,
      {},
    );
    return res.data;
  },

  updateDispositions: async (
    id: string,
    body: {
      items: Array<{
        returnItemId: string;
        disposition: "RESTOCK" | "QUARANTINE" | "WRITE_OFF";
        actualProductId?: string;
      }>;
    },
  ) => {
    const res = await apiHttp.patch<ReturnPackage>(`/return-packages/${id}/dispositions`, body);
    return res.data;
  },
};
