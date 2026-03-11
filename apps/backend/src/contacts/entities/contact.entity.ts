export type Contact = {
  id: string;
  companyId?: string;
  company?: {
    id: string;
    name: string;
  };
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  ownerId?: string | null;
  owner?: { id: string; fullName: string; email: string } | null;
  isPrimary: boolean;
  /** Код 1С (из Bitrix UF_CRM_1772007718612). */
  externalCode?: string | null;
  region?: string | null;
  addressInfo?: string | null;
  city?: string | null;
  clientType?: string | null;
  createdAt: string;
  updatedAt: string;
  recipients?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    warehouse: string;
    createdAt: string;
    updatedAt: string;
  }[];
};
