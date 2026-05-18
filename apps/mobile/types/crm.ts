/** CRM Visit (subset). Shape matches Nest + Prisma JSON. */
export type VisitSummary = {
  id: string;
  title?: string | null;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  purpose?: string | null;
  radiusM?: number;
  outcome?: string | null;
  resultNote?: string | null;
  startGpsVerification?: string | null;
  completeGpsVerification?: string | null;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    phone?: string;
  } | null;
  company?: {
    id: string;
    name: string;
    phone?: string | null;
  } | null;
};

export type AuthUserBrief = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUserBrief;
};
