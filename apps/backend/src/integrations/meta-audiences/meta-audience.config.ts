import { BadRequestException } from "@nestjs/common";
import {
  maskSecret,
  metaGraphApiVersion,
  normalizeAdAccountId,
} from "./meta-audience.normalize";
import {
  AUDIENCE_KEYS,
  DEFAULT_LAPSED_DAYS,
  DEFAULT_SEED_WINDOW_DAYS,
  emptyAudienceState,
  emptyStoredMetaAudiences,
  type AudienceKey,
  type AudienceSyncState,
  type PublicMetaAudiences,
  type StoredMetaAudiences,
} from "./meta-audience.types";

export type MetaAudiencesPatch = {
  adAccountId?: string;
  accessToken?: string;
  enabled?: boolean;
  lapsedDays?: number;
  seedWindowDays?: number;
};

function dayCount(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 1 || number > 3650) return fallback;
  return number;
}

function parseState(value: unknown): AudienceSyncState {
  const empty = emptyAudienceState();
  if (!value || typeof value !== "object") return empty;
  const row = value as Record<string, unknown>;
  const status = row.status;
  return {
    audienceId: typeof row.audienceId === "string" && row.audienceId.trim() ? row.audienceId.trim() : null,
    status: status === "ok" || status === "empty" || status === "error" ? status : "idle",
    syncedAt: typeof row.syncedAt === "string" ? row.syncedAt : null,
    crmCount: typeof row.crmCount === "number" && Number.isFinite(row.crmCount) ? row.crmCount : null,
    metaReceived: typeof row.metaReceived === "number" && Number.isFinite(row.metaReceived) ? row.metaReceived : null,
    error: typeof row.error === "string" && row.error.trim() ? row.error : null,
    warning: row.warning === "small" ? "small" : null,
  };
}

export function parseStoredMetaAudiences(value: unknown): StoredMetaAudiences {
  const base = emptyStoredMetaAudiences();
  if (!value || typeof value !== "object") return base;
  const row = value as Record<string, unknown>;
  const audiences = (row.audiences ?? {}) as Record<string, unknown>;
  let adAccountId: string | null = null;
  if (typeof row.adAccountId === "string" && row.adAccountId.trim()) {
    try {
      adAccountId = normalizeAdAccountId(row.adAccountId);
    } catch {
      adAccountId = null;
    }
  }
  const stored: StoredMetaAudiences = {
    adAccountId,
    accessToken: typeof row.accessToken === "string" && row.accessToken.trim() ? row.accessToken.trim() : null,
    enabled: row.enabled === true,
    lapsedDays: dayCount(row.lapsedDays, DEFAULT_LAPSED_DAYS),
    seedWindowDays: dayCount(row.seedWindowDays, DEFAULT_SEED_WINDOW_DAYS),
    audiences: {
      buyers_12m: parseState(audiences.buyers_12m),
      buyers_all: parseState(audiences.buyers_all),
      buyers_lapsed: parseState(audiences.buyers_lapsed),
      leads_no_order: parseState(audiences.leads_no_order),
    },
  };
  return stored;
}

function requireDays(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new BadRequestException(`${label} має бути цілим числом від 1 до 3650`);
  }
  return value;
}

export function applyMetaAudiencesPatch(current: StoredMetaAudiences, patch: MetaAudiencesPatch): StoredMetaAudiences {
  const next: StoredMetaAudiences = {
    ...current,
    audiences: {
      buyers_12m: { ...current.audiences.buyers_12m },
      buyers_all: { ...current.audiences.buyers_all },
      buyers_lapsed: { ...current.audiences.buyers_lapsed },
      leads_no_order: { ...current.audiences.leads_no_order },
    },
  };
  if (typeof patch.adAccountId === "string") {
    next.adAccountId = patch.adAccountId.trim() ? normalizeAdAccountId(patch.adAccountId) : null;
  }
  if (typeof patch.accessToken === "string" && patch.accessToken.trim()) {
    next.accessToken = patch.accessToken.trim();
  }
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (patch.lapsedDays != null) next.lapsedDays = requireDays(patch.lapsedDays, "Поріг уснувших");
  if (patch.seedWindowDays != null) next.seedWindowDays = requireDays(patch.seedWindowDays, "Вікно семені");
  return next;
}

export function toPublicMetaAudiences(stored: StoredMetaAudiences): PublicMetaAudiences {
  return {
    adAccountId: stored.adAccountId,
    accessTokenMasked: maskSecret(stored.accessToken),
    enabled: stored.enabled,
    lapsedDays: stored.lapsedDays,
    seedWindowDays: stored.seedWindowDays,
    graphApiVersion: metaGraphApiVersion(),
    audiences: AUDIENCE_KEYS.map((key: AudienceKey) => {
      const row = stored.audiences[key] ?? emptyAudienceState();
      return {
        key,
        audienceId: row.audienceId,
        status: row.status,
        syncedAt: row.syncedAt,
        crmCount: row.crmCount,
        metaReceived: row.metaReceived,
        error: row.error,
        warning: row.warning,
      };
    }),
  };
}
