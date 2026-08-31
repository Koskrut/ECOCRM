import type { LeadAttentionPreset, LeadChannel, LeadSource, LeadStatus } from "@/lib/api/resources/leads";

export type LeadStatusFilter = "" | "all" | LeadStatus;
export type LeadOwnerFilter = "" | "unassigned" | string;

export type LeadsUrlState = {
  q: string;
  status: LeadStatusFilter;
  source: "" | LeadSource;
  channel: "" | LeadChannel;
  ownerId: LeadOwnerFilter;
  dateFrom: string;
  dateTo: string;
  sortBy: "createdAt" | "score";
  sortOrder: "asc" | "desc";
  attention: "" | LeadAttentionPreset;
  ids: string;
  page: number;
  leadId: string;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
};

const LEAD_STATUSES: LeadStatus[] = ["NEW", "IN_PROGRESS", "WON", "NOT_TARGET", "LOST", "SPAM"];
const LEAD_SOURCES: LeadSource[] = [
  "META",
  "FACEBOOK",
  "TELEGRAM",
  "INSTAGRAM",
  "WEBSITE",
  "RINGOSTAT",
  "KYIVSTAR",
  "OTHER",
];
const LEAD_CHANNELS: LeadChannel[] = ["FB_LEAD_ADS", "IG_LEAD_ADS", "FB_DM", "IG_DM"];
const ATTENTION_PRESETS: LeadAttentionPreset[] = [
  "without-touch",
  "never-contacted-new",
  "stale-in-progress",
];

function parseStatus(raw: string | null): LeadStatusFilter {
  if (!raw) return "";
  if (raw === "all") return "all";
  if (LEAD_STATUSES.includes(raw as LeadStatus)) return raw as LeadStatus;
  return "";
}

function parseSource(raw: string | null): "" | LeadSource {
  if (raw && LEAD_SOURCES.includes(raw as LeadSource)) return raw as LeadSource;
  return "";
}

function parseChannel(raw: string | null): "" | LeadChannel {
  if (raw && LEAD_CHANNELS.includes(raw as LeadChannel)) return raw as LeadChannel;
  return "";
}

function parseAttention(raw: string | null): "" | LeadAttentionPreset {
  if (raw && ATTENTION_PRESETS.includes(raw as LeadAttentionPreset)) {
    return raw as LeadAttentionPreset;
  }
  return "";
}

function parseSortBy(raw: string | null): "createdAt" | "score" {
  return raw === "score" ? "score" : "createdAt";
}

function parseSortOrder(raw: string | null): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

export const DEFAULT_LEADS_URL: LeadsUrlState = {
  q: "",
  status: "",
  source: "",
  channel: "",
  ownerId: "",
  dateFrom: "",
  dateTo: "",
  sortBy: "createdAt",
  sortOrder: "desc",
  attention: "",
  ids: "",
  page: 1,
  leadId: "",
};

export function parseLeadsUrl(sp: SearchParamsLike): LeadsUrlState {
  const pageRaw = Number(sp.get("page") ?? "1");
  const leadId = (sp.get("leadId") ?? sp.get("open") ?? "").trim();
  return {
    q: (sp.get("q") ?? "").trim(),
    status: parseStatus(sp.get("status")),
    source: parseSource(sp.get("source")),
    channel: parseChannel(sp.get("channel")),
    ownerId: (sp.get("ownerId") ?? "").trim(),
    dateFrom: (sp.get("dateFrom") ?? "").trim(),
    dateTo: (sp.get("dateTo") ?? "").trim(),
    sortBy: parseSortBy(sp.get("sortBy")),
    sortOrder: parseSortOrder(sp.get("sortOrder")),
    attention: parseAttention(sp.get("attention")),
    ids: (sp.get("ids") ?? "").trim(),
    page: Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1,
    leadId,
  };
}

export function buildLeadsSearchParams(state: LeadsUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);
  if (state.source) params.set("source", state.source);
  if (state.channel) params.set("channel", state.channel);
  if (state.ownerId) params.set("ownerId", state.ownerId);
  if (state.dateFrom) params.set("dateFrom", state.dateFrom);
  if (state.dateTo) params.set("dateTo", state.dateTo);
  if (state.sortBy !== DEFAULT_LEADS_URL.sortBy) params.set("sortBy", state.sortBy);
  if (state.sortOrder !== DEFAULT_LEADS_URL.sortOrder) params.set("sortOrder", state.sortOrder);
  if (state.attention) params.set("attention", state.attention);
  if (state.ids) params.set("ids", state.ids);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.leadId) params.set("leadId", state.leadId);
  return params;
}

export function isLeadsFilterActive(state: LeadsUrlState): boolean {
  return Boolean(
    state.status ||
      state.source ||
      state.channel ||
      state.ownerId ||
      state.dateFrom ||
      state.dateTo ||
      state.sortBy !== DEFAULT_LEADS_URL.sortBy ||
      state.sortOrder !== DEFAULT_LEADS_URL.sortOrder ||
      state.attention ||
      state.ids ||
      state.q,
  );
}
