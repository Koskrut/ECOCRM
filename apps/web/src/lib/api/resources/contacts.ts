import { apiHttp } from "../client";

export type Contact = {
  id: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  telegramLinked?: boolean;
  telegramUsername?: string | null;
  telegramLastMessageAt?: string | null;
  telegramConversationId?: string | null;
  hasCallToday?: boolean;
  hasMissedCall?: boolean;
};

export type ContactsResponse = {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
};

export type ContactsListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
};

export const contactsApi = {
  list: async (params?: ContactsListParams): Promise<ContactsResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    if (params?.q?.trim()) searchParams.set("q", params.q.trim());
    if (params?.companyId) searchParams.set("companyId", params.companyId);
    const qs = searchParams.toString();
    const res = await apiHttp.get<ContactsResponse>(`/contacts${qs ? `?${qs}` : ""}`);
    return res.data;
  },

  get: async (id: string): Promise<Contact> => {
    const res = await apiHttp.get<Contact>(`/contacts/${id}`);
    return res.data;
  },
};
