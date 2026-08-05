export type CompanyAddress = {
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

export type Company = {
  id: string;
  name: string;
  edrpou?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  region?: string | null;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
  owner?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  lastVisitAt?: string;
  addresses?: CompanyAddress[];
};
