import {
  CONTACT_PRIORITY_REASON_CODES,
  CONTACT_WORK_QUEUE_PRESETS,
  type ContactPriorityReasonCode,
  type ContactWorkQueuePreset,
} from "@/lib/api/resources/contacts";

export type ContactsSortBy = "createdAt" | "updatedAt" | "name" | "hasCallToday" | "hasMissedCall";
export type ContactsSortDir = "asc" | "desc";
export type ContactsWorkPreset = "all" | ContactWorkQueuePreset;

export type ContactsUrlState = {
  q: string;
  workPreset: ContactsWorkPreset;
  companyId: string;
  ownerId: string;
  hasPhone: string;
  hasEmail: string;
  hasCallToday: string;
  hasMissedCall: string;
  regions: string[];
  cities: string[];
  clientType: string;
  sortBy: ContactsSortBy;
  sortDir: ContactsSortDir;
  /** Priority reason codes — only applied in preset (work-queue) mode. */
  reasons: ContactPriorityReasonCode[];
  page: number;
  contactId: string;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
  keys: () => IterableIterator<string>;
  forEach: (cb: (value: string, key: string) => void) => void;
};

const LIST_KEYS = new Set([
  "q",
  "workPreset",
  "companyId",
  "ownerId",
  "hasPhone",
  "hasEmail",
  "hasCallToday",
  "hasMissedCall",
  "region",
  "city",
  "clientType",
  "sortBy",
  "sortDir",
  "reason",
  "page",
]);

const BOOL_FILTERS = new Set(["yes", "no"]);
const REASON_SET = new Set<string>(CONTACT_PRIORITY_REASON_CODES);

export const DEFAULT_CONTACTS_URL: ContactsUrlState = {
  q: "",
  workPreset: "all",
  companyId: "",
  ownerId: "",
  hasPhone: "",
  hasEmail: "",
  hasCallToday: "",
  hasMissedCall: "",
  regions: [],
  cities: [],
  clientType: "",
  sortBy: "createdAt",
  sortDir: "desc",
  reasons: [],
  page: 1,
  contactId: "",
};

function parseWorkPreset(raw: string | null): ContactsWorkPreset {
  if (!raw || raw === "all") return "all";
  if (CONTACT_WORK_QUEUE_PRESETS.includes(raw as ContactWorkQueuePreset)) {
    return raw as ContactWorkQueuePreset;
  }
  return "all";
}

function parseSortBy(raw: string | null): ContactsSortBy {
  if (raw === "updatedAt" || raw === "name" || raw === "hasCallToday" || raw === "hasMissedCall") {
    return raw;
  }
  return "createdAt";
}

function parseSortDir(raw: string | null): ContactsSortDir {
  return raw === "asc" ? "asc" : "desc";
}

function parseBoolFilter(raw: string | null): string {
  if (raw && BOOL_FILTERS.has(raw)) return raw;
  return "";
}

function parsePage(raw: string | null): number {
  const n = Number(raw ?? "1");
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function parseReasons(sp: SearchParamsLike): ContactPriorityReasonCode[] {
  const seen = new Set<ContactPriorityReasonCode>();
  const out: ContactPriorityReasonCode[] = [];
  for (const raw of sp.getAll("reason")) {
    for (const part of raw.split(",")) {
      const code = part.trim();
      if (!REASON_SET.has(code)) continue;
      const typed = code as ContactPriorityReasonCode;
      if (seen.has(typed)) continue;
      seen.add(typed);
      out.push(typed);
    }
  }
  return out;
}

export function parseContactsUrl(sp: SearchParamsLike): ContactsUrlState {
  const workPreset = parseWorkPreset(sp.get("workPreset"));
  return {
    q: (sp.get("q") ?? "").trim(),
    workPreset,
    companyId: (sp.get("companyId") ?? "").trim(),
    ownerId: (sp.get("ownerId") ?? "").trim(),
    hasPhone: parseBoolFilter(sp.get("hasPhone")),
    hasEmail: parseBoolFilter(sp.get("hasEmail")),
    hasCallToday: parseBoolFilter(sp.get("hasCallToday")),
    hasMissedCall: parseBoolFilter(sp.get("hasMissedCall")),
    regions: sp
      .getAll("region")
      .map((v) => v.trim())
      .filter(Boolean),
    cities: sp
      .getAll("city")
      .map((v) => v.trim())
      .filter(Boolean),
    clientType: (sp.get("clientType") ?? "").trim(),
    sortBy: parseSortBy(sp.get("sortBy")),
    sortDir: parseSortDir(sp.get("sortDir")),
    reasons: workPreset === "all" ? [] : parseReasons(sp),
    page: parsePage(sp.get("page")),
    contactId: (sp.get("contactId") ?? "").trim(),
  };
}

/**
 * Build URL params for list state while preserving modal/create and unknown keys
 * from the current search string.
 */
export function buildContactsSearchParams(
  state: ContactsUrlState,
  existing?: SearchParamsLike | URLSearchParams | null,
): URLSearchParams {
  const params = new URLSearchParams();

  if (existing) {
    existing.forEach((value, key) => {
      if (LIST_KEYS.has(key) || key === "contactId") return;
      params.append(key, value);
    });
  }

  if (state.q) params.set("q", state.q);
  if (state.workPreset !== "all") params.set("workPreset", state.workPreset);
  if (state.workPreset === "all") {
    if (state.companyId) params.set("companyId", state.companyId);
    if (state.hasPhone) params.set("hasPhone", state.hasPhone);
    if (state.hasEmail) params.set("hasEmail", state.hasEmail);
    if (state.hasCallToday) params.set("hasCallToday", state.hasCallToday);
    if (state.hasMissedCall) params.set("hasMissedCall", state.hasMissedCall);
    for (const region of state.regions) params.append("region", region);
    for (const city of state.cities) params.append("city", city);
    if (state.clientType) params.set("clientType", state.clientType);
    if (state.sortBy !== DEFAULT_CONTACTS_URL.sortBy) params.set("sortBy", state.sortBy);
    if (state.sortDir !== DEFAULT_CONTACTS_URL.sortDir) params.set("sortDir", state.sortDir);
  } else {
    for (const reason of state.reasons) params.append("reason", reason);
  }
  if (state.ownerId) params.set("ownerId", state.ownerId);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.contactId) params.set("contactId", state.contactId);

  return params;
}

export function isContactsFilterActive(state: ContactsUrlState): boolean {
  if (state.q.trim() || state.ownerId) return true;
  if (state.workPreset !== "all") return state.reasons.length > 0;
  return Boolean(
    state.companyId ||
    state.hasPhone ||
    state.hasEmail ||
    state.hasCallToday ||
    state.hasMissedCall ||
    state.regions.length ||
    state.cities.length ||
    state.clientType ||
    state.sortBy !== DEFAULT_CONTACTS_URL.sortBy ||
    state.sortDir !== DEFAULT_CONTACTS_URL.sortDir,
  );
}

export function isContactsPresetMode(state: ContactsUrlState): boolean {
  return state.workPreset !== "all";
}

export function clampContactsPage(page: number, total: number, pageSize: number): number {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const safe = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return Math.min(safe, totalPages);
}

export type QueueEmptyActionKind = "resetOwner" | "resetFilters" | "openAll";

export function resolveQueueEmptyAction(opts: {
  ownerId: string;
  q: string;
  reasons?: ContactPriorityReasonCode[];
}): QueueEmptyActionKind {
  const hasOwner = Boolean(opts.ownerId);
  const hasQ = Boolean(opts.q.trim());
  const hasReasons = (opts.reasons?.length ?? 0) > 0;
  const hasExtra = hasQ || hasReasons;
  if (hasOwner && hasExtra) return "resetFilters";
  if (hasOwner) return "resetOwner";
  if (hasExtra) return "resetFilters";
  return "openAll";
}
