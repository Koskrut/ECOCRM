export type Company = {
  id: string;
  name: string;
  edrpou?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
  owner?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  lastVisitAt?: string;
};
