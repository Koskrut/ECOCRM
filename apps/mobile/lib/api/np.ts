import { apiFetch } from "@/lib/api";

export type NpCity = {
  ref: string;
  description: string;
};

export type NpWarehouse = {
  ref: string;
  description: string;
  shortAddress?: string | null;
  number?: string | null;
  isPostomat?: boolean;
};

export type NpStreet = {
  ref: string;
  description: string;
};

export type NpSearchResponse<T> = {
  status: string;
  items: T[];
  message?: string;
};

export type NpRecipientType = "PERSON" | "COMPANY";
export type NpDeliveryType = "WAREHOUSE" | "POSTOMAT" | "ADDRESS";

export type CreateNpTtnDraft = {
  recipientType: NpRecipientType;
  deliveryType: NpDeliveryType;
  label?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  companyName?: string;
  edrpou?: string;
  contactPersonFirstName?: string;
  contactPersonLastName?: string;
  contactPersonMiddleName?: string;
  contactPersonPhone?: string;
  cityRef: string;
  cityName?: string;
  warehouseRef?: string;
  warehouseNumber?: string;
  warehouseType?: string;
  streetRef?: string;
  streetName?: string;
  building?: string;
  flat?: string;
};

export type CreateNpTtnBody = {
  profileId?: string;
  draft?: CreateNpTtnDraft;
  saveAsProfile?: boolean;
  profileLabel?: string;
  description?: string;
  declaredCost?: number;
  seatsAmount?: number;
  payerType?: string;
  paymentMethod?: string;
  ignoreDuplicateCheck?: boolean;
};

export type CreateNpTtnResponse = {
  ttnId: string;
  documentNumber: string;
  documentRef?: string | null;
  cost?: number | null;
};

export type NpTtnStatusResponse = {
  ok: boolean;
  fromCache?: boolean;
  ttn: string;
  status?: Record<string, unknown>;
  snapshot?: unknown;
};

export type NpTtnDetailsResponse = {
  ok: boolean;
  ttn: {
    id: string;
    documentNumber: string;
    statusCode?: string | null;
    statusText?: string | null;
    editable?: boolean;
  };
};

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const npApi = {
  cities: (token: string, q: string, limit = 20) =>
    apiFetch<NpSearchResponse<NpCity>>(`/np/cities${qs({ q, limit })}`, { token }),

  warehouses: (
    token: string,
    args: { cityRef: string; q?: string; type?: NpDeliveryType; limit?: number },
  ) =>
    apiFetch<NpSearchResponse<NpWarehouse>>(
      `/np/warehouses${qs({
        cityRef: args.cityRef,
        q: args.q,
        type: args.type === "POSTOMAT" ? "POSTOMAT" : args.type === "WAREHOUSE" ? "WAREHOUSE" : undefined,
        limit: args.limit ?? 20,
      })}`,
      { token },
    ),

  streets: (token: string, args: { cityRef: string; q: string; limit?: number }) =>
    apiFetch<NpSearchResponse<NpStreet>>(
      `/np/streets${qs({ cityRef: args.cityRef, q: args.q, limit: args.limit ?? 20 })}`,
      { token },
    ),

  ttnDefaults: (token: string) =>
    apiFetch<Record<string, unknown>>("/np/ttn/defaults", { token }),

  getTtn: (token: string, orderId: string) =>
    apiFetch<NpTtnDetailsResponse>(`/np/ttn/${orderId}`, { token }),

  ttnStatus: (token: string, orderId: string, sync = true) =>
    apiFetch<NpTtnStatusResponse>(`/np/ttn/${orderId}/status${qs({ sync: sync ? "1" : undefined })}`, {
      token,
    }),

  createTtn: (token: string, orderId: string, body: CreateNpTtnBody) =>
    apiFetch<CreateNpTtnResponse>(`/np/ttn/${orderId}`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};
