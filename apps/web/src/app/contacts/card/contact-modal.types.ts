import type { EntityAddress } from "@/lib/api/resources/entity-addresses";
import type { ContactPhone } from "./ContactPhonesSection";

export type ContactModalContact = {
  id: string;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  ownerId?: string | null;
  owner?: { id: string; fullName: string; email: string } | null;
  externalCode?: string | null;
  documentDisplayName?: string | null;
  region?: string | null;
  addressInfo?: string | null;
  city?: string | null;
  clientType?: string | null;
  status?: string | null;
  nextActionType?: string | null;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
  clientStage?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  lastVisitAt?: string | null;
  telegramLinked?: boolean;
  telegramUsername?: string | null;
  telegramLastMessageAt?: string | null;
  telegramConversationId?: string | null;
  phones?: ContactPhone[];
  addresses?: EntityAddress[];
};

export type ContactCardTabId =
  | "overview"
  | "activity"
  | "orders"
  | "finance"
  | "delivery"
  | "profile";

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
