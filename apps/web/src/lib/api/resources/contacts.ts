import { apiHttp } from "../client";

export type Contact = {
  id: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContactsResponse = {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
};

export const contactsApi = {
  list: async (): Promise<ContactsResponse> => {
    const res = await apiHttp.get<ContactsResponse>("/contacts");
    return res.data;
  },

  get: async (id: string): Promise<Contact> => {
    const res = await apiHttp.get<Contact>(`/contacts/${id}`);
    return res.data;
  },
};
