export const META_AUDIENCES_SETTING_ID = "meta_audiences";

export const AUDIENCE_KEYS = ["buyers_12m", "buyers_all", "buyers_lapsed", "leads_no_order"] as const;

export type AudienceKey = (typeof AUDIENCE_KEYS)[number];

export const DEFAULT_LAPSED_DAYS = 120;
export const DEFAULT_SEED_WINDOW_DAYS = 365;
export const SMALL_AUDIENCE_LIMIT = 100;
export const META_AUDIENCE_BATCH = 5_000;

export const AUDIENCE_CATALOG: Record<
  AudienceKey,
  { name: string; description: string; valueBased: boolean }
> = {
  buyers_12m: {
    name: "CRM buyers 12m",
    description: "Buyers whose last completed order is inside the seed window and not past the lapse threshold.",
    valueBased: true,
  },
  buyers_all: {
    name: "CRM buyers all",
    description: "Everyone with a completed order and no open debt.",
    valueBased: false,
  },
  buyers_lapsed: {
    name: "CRM buyers lapsed",
    description: "Buyers whose last completed order is older than the lapse threshold.",
    valueBased: false,
  },
  leads_no_order: {
    name: "CRM leads no order",
    description: "Leads with a phone who have not become buyers.",
    valueBased: false,
  },
};

export type AudienceSyncStatus = "idle" | "ok" | "empty" | "error";

export type AudienceWarning = "small" | null;

export type AudienceSyncState = {
  audienceId: string | null;
  status: AudienceSyncStatus;
  syncedAt: string | null;
  crmCount: number | null;
  metaReceived: number | null;
  error: string | null;
  warning: AudienceWarning;
};

export type StoredMetaAudiences = {
  adAccountId: string | null;
  accessToken: string | null;
  enabled: boolean;
  lapsedDays: number;
  seedWindowDays: number;
  audiences: Record<AudienceKey, AudienceSyncState>;
};

export type PublicAudienceRow = {
  key: AudienceKey;
  audienceId: string | null;
  status: AudienceSyncStatus;
  syncedAt: string | null;
  crmCount: number | null;
  metaReceived: number | null;
  error: string | null;
  warning: AudienceWarning;
};

export type PublicMetaAudiences = {
  adAccountId: string | null;
  accessTokenMasked: string;
  enabled: boolean;
  lapsedDays: number;
  seedWindowDays: number;
  graphApiVersion: string;
  audiences: PublicAudienceRow[];
};

export type NormalizedPerson = {
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  value: number | null;
};

export type AudienceSegment = {
  people: NormalizedPerson[];
};

export function emptyAudienceState(): AudienceSyncState {
  return {
    audienceId: null,
    status: "idle",
    syncedAt: null,
    crmCount: null,
    metaReceived: null,
    error: null,
    warning: null,
  };
}

export function emptyStoredMetaAudiences(): StoredMetaAudiences {
  return {
    adAccountId: null,
    accessToken: null,
    enabled: false,
    lapsedDays: DEFAULT_LAPSED_DAYS,
    seedWindowDays: DEFAULT_SEED_WINDOW_DAYS,
    audiences: {
      buyers_12m: emptyAudienceState(),
      buyers_all: emptyAudienceState(),
      buyers_lapsed: emptyAudienceState(),
      leads_no_order: emptyAudienceState(),
    },
  };
}
