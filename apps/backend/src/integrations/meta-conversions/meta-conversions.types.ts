export const META_CONVERSIONS_SETTING_ID = "meta_conversions";
export const DEFAULT_META_PIXEL_ID = "1262413015423388";
export const STORE_EVENT_SOURCE_URL = "https://www.suprex.dental";

/** Pixels that must not be wired to this integration. */
export const BLOCKED_META_PIXEL_IDS = ["1461759528829507", "1486254589075426"] as const;

export type MetaChannel = "website" | "telegram";

export type StoredMetaConversions = {
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastEventName: string | null;
  lastError: string | null;
  sentEventIds: string[];
};

export type PublicMetaConversions = {
  pixelId: string;
  accessTokenMasked: string;
  testEventCode: string;
  enabled: boolean;
  graphApiVersion: string;
  lastSuccessAt: string | null;
  lastEventName: string | null;
  lastError: string | null;
};

export type PurchaseInput = {
  orderId: string;
  value: number;
  currency: string;
  channel: MetaChannel;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  zip?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  eventSourceUrl?: string | null;
};

export type ContactInput = {
  eventId: string;
  label: string;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
};

export type ViewContentInput = {
  eventId: string;
  path: string;
  search: string;
  externalId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
};

export function emptyStoredMetaConversions(): StoredMetaConversions {
  return {
    pixelId: DEFAULT_META_PIXEL_ID,
    accessToken: "",
    testEventCode: "",
    enabled: false,
    lastSuccessAt: null,
    lastEventName: null,
    lastError: null,
    sentEventIds: [],
  };
}
