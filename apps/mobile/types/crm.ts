export type VisitOwnerSnippet = {
  id: string;
  fullName: string;
  email?: string;
};

/** CRM Visit (subset). Shape matches Nest + Prisma JSON. */
export type VisitSummary = {
  id: string;
  ownerId?: string;
  owner?: VisitOwnerSnippet | null;
  title?: string | null;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  completedAt?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  purpose?: string | null;
  radiusM?: number;
  outcome?: string | null;
  resultNote?: string | null;
  startGpsVerification?: string | null;
  completeGpsVerification?: string | null;
  contactId?: string | null;
  companyId?: string | null;
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

export type FieldShiftStatus = "ACTIVE" | "ENDED";

export type FieldShift = {
  id: string;
  ownerId: string;
  date: string;
  status: FieldShiftStatus;
  startedAt: string;
  endedAt: string | null;
  trackingEnabled: boolean;
  plannedDistanceKm: number | null;
};

export type LocationSampleInput = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
};

export type ContactClientStage =
  | "NEW_LEAD"
  | "IN_PROGRESS"
  | "WAITING_DECISION"
  | "ACTIVE_CLIENT"
  | "DORMANT_CLIENT"
  | "AT_RISK"
  | "PROBLEM_DEBT"
  | "LOST_CLIENT";

export type Contact = {
  id: string;
  companyId?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  email?: string | null;
  position?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  clientStage?: ContactClientStage | null;
  status?: string | null;
  company?: { id: string; name: string; phone?: string | null } | null;
  phones?: { id: string; phone: string; label?: string | null }[];
};

export type ListContactsResponse = {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
};

export type ContactPhonesResponse = {
  primary: string | null;
  additional: { id: string; phone: string; label?: string | null }[];
};

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
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
  owner?: { id: string; fullName: string } | null;
  createdAt?: string;
  updatedAt?: string;
  lastVisitAt?: string;
  addresses?: CompanyAddress[];
};

export type ListCompaniesResponse = {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
};

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELED";

export type Task = {
  id: string;
  title: string;
  body?: string | null;
  dueAt?: string | null;
  status: TaskStatus;
  contactId?: string | null;
  contact?: { id: string; firstName: string; lastName: string; phone: string } | null;
  company?: { id: string; name: string } | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListTasksResponse = {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
};

export type UpdateTaskBody = Partial<{
  title: string;
  body: string | null;
  dueAt: string | null;
  status: TaskStatus;
}>;

export type OrderItem = {
  id: string;
  productId: string | null;
  productName?: string | null;
  productNameSnapshot?: string | null;
  qty: number;
  price: number;
  discountPercent: number;
  lineTotal: number;
  product?: { sku?: string | null; name?: string | null } | null;
};

export type ProductStockByWarehouse = {
  warehouseId: string;
  warehouseName?: string;
  qty?: number;
  availableQty?: number;
};

export type Product = {
  id: string;
  sku?: string | null;
  name?: string | null;
  unit?: string | null;
  basePrice?: number | null;
  /** Physical stock total (API field: stock). */
  stock?: number | null;
  /** @deprecated use stock */
  totalStock?: number | null;
  availableStock?: number | null;
  stockByWarehouse?: ProductStockByWarehouse[];
};

export type NpRecipientType = "PERSON" | "COMPANY";
export type NpDeliveryType = "WAREHOUSE" | "POSTOMAT" | "ADDRESS";

export type ContactShippingProfile = {
  id: string;
  label: string;
  isDefault?: boolean;
  recipientType: NpRecipientType;
  deliveryType: NpDeliveryType;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  phone?: string | null;
  companyName?: string | null;
  edrpou?: string | null;
  contactPersonFirstName?: string | null;
  contactPersonLastName?: string | null;
  contactPersonMiddleName?: string | null;
  contactPersonPhone?: string | null;
  cityRef?: string | null;
  cityName?: string | null;
  warehouseRef?: string | null;
  warehouseNumber?: string | null;
  warehouseType?: string | null;
  streetRef?: string | null;
  streetName?: string | null;
  building?: string | null;
  flat?: string | null;
};

export type CreateShippingProfileBody = {
  label: string;
  isDefault?: boolean;
  recipientType: NpRecipientType;
  deliveryType: NpDeliveryType;
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
  cityRef?: string;
  cityName?: string;
  warehouseRef?: string;
  warehouseNumber?: string;
  warehouseType?: string;
  streetRef?: string;
  streetName?: string;
  building?: string;
  flat?: string;
};

export type DraftOrderLine = {
  key: string;
  itemId?: string;
  productId: string;
  productName: string;
  qty: number;
  price: number;
  discountPercent: number;
};

export type Order = {
  id: string;
  orderNumber?: string | null;
  status: string;
  orderStage?: string | null;
  totalAmount?: number | null;
  subtotalAmount?: number | null;
  discountAmount?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  exchangeRate?: number | null;
  paymentStatus?: string | null;
  currency?: string | null;
  createdAt: string;
  contactId?: string | null;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  comment?: string | null;
  deliveryMethod?: string | null;
  deliveryData?: Record<string, unknown> | null;
  paymentType?: string | null;
  paymentMethod?: string | null;
  paymentDueDate?: string | null;
  bankAccountId?: string | null;
  warehouseId?: string | null;
  documentsRequested?: boolean | null;
  warehouse?: { id: string; name: string } | null;
  bankAccount?: { id: string; name: string } | null;
  items?: OrderItem[];
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  } | null;
};
