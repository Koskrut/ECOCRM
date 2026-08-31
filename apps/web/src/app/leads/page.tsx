"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Inbox, Search, X } from "lucide-react";
import {
  leadsApi,
  type Lead,
  type LeadAttentionPreset,
  type LeadSource,
  type LeadsResponse,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadModal } from "./LeadModal";
import { CreateLeadModal } from "./CreateLeadModal";
import { LeadsFiltersPopover, type LeadsFiltersState } from "./LeadsFiltersPopover";
import { LeadCard } from "./LeadCard";
import { formatDate } from "@/lib/crmDatetime";
import { useListColumns } from "@/lib/lists/useListColumns";
import { renderCellText } from "@/lib/lists/renderCell";
import { HelpHint } from "@/components/help/HelpHint";
import { withPreservedScroll } from "@/lib/modal/preserveScroll";
import { EmptyState, ErrorPanel } from "@/components/feedback";
import { leadStatusLabel } from "@/lib/status-labels";
import { strings } from "@/locales";
import { interpolate } from "@/lib/task-labels";
import { leadScoreTone } from "./lead-score";
import {
  DEFAULT_LEADS_URL,
  buildLeadsSearchParams,
  isLeadsFilterActive,
  parseLeadsUrl,
  type LeadsUrlState,
} from "./leads-url";

const t = strings.leads;
const PAGE_SIZE = 20;

const SOURCE_KEYS = Object.keys(t.sources) as LeadSource[];

function leadPrimaryLabel(lead: Lead): string {
  const personName = [lead.lastName, lead.firstName, lead.middleName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return personName || lead.companyName || lead.fullName || lead.name || "—";
}

function sourceLabel(source?: string | null): string {
  if (!source) return "—";
  return (t.sources as Record<string, string>)[source] ?? source;
}

function channelLabel(channel?: string | null): string | null {
  if (!channel) return null;
  return (t.channels as Record<string, string>)[channel] ?? channel;
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (typeof score !== "number") {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <span
      title={t.scoreTooltip}
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${leadScoreTone(score)}`}
    >
      {score}
    </span>
  );
}

function LeadsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlState = useMemo(() => parseLeadsUrl(searchParams), [searchParams]);

  const [createOpen, setCreateOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [qInput, setQInput] = useState(urlState.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ id: string; fullName: string }>>([]);

  // Keep local search input in sync when URL changes (back/forward).
  useEffect(() => {
    setQInput(urlState.q);
  }, [urlState.q]);

  const replaceUrl = useCallback(
    (next: LeadsUrlState) => {
      const params = buildLeadsSearchParams(next);
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      const current = searchParams.toString();
      if (qs !== current) {
        router.replace(href, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  const patchUrl = useCallback(
    (patch: Partial<LeadsUrlState>) => {
      replaceUrl({ ...urlState, ...patch });
    },
    [replaceUrl, urlState],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const { extraColumns, customValues, loadValuesFor } = useListColumns("LEAD");
  const colCount = 8 + extraColumns.length;

  useEffect(() => {
    if (items.length === 0) return;
    void loadValuesFor(items.map((l) => l.id));
  }, [items, loadValuesFor]);

  // Debounce search — only reset page when q actually changes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      if (nextQ === urlState.q) return;
      patchUrl({ q: nextQ, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput, urlState.q, patchUrl]);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const run = async () => {
        try {
          if (!opts?.silent) setLoading(true);
          setError(null);

          const params: Parameters<typeof leadsApi.list>[0] = {
            page: urlState.page,
            pageSize: PAGE_SIZE,
            sortBy: urlState.sortBy,
            sortOrder: urlState.sortOrder,
          };
          if (urlState.attention) params.attention = urlState.attention;
          if (urlState.ids) params.ids = urlState.ids;
          if (urlState.q.trim()) params.q = urlState.q.trim();
          if (!urlState.attention && !urlState.ids) {
            if (urlState.status === "all") params.status = "all";
            else if (urlState.status) params.status = urlState.status;
          }
          if (urlState.source) params.source = urlState.source;
          if (urlState.channel) params.channel = urlState.channel;
          if (urlState.ownerId) params.ownerId = urlState.ownerId;
          if (urlState.dateFrom) params.dateFrom = urlState.dateFrom;
          if (urlState.dateTo) params.dateTo = urlState.dateTo;

          const res: LeadsResponse = await leadsApi.list(params);
          setItems(res.items);
          setTotal(res.total);
        } catch (e) {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (e instanceof Error ? e.message : "Не вдалося завантажити ліди");
          setError(typeof msg === "string" ? msg : "Не вдалося завантажити ліди");
          setItems([]);
        } finally {
          setLoading(false);
        }
      };
      if (opts?.silent) await withPreservedScroll(run);
      else await run();
    },
    [urlState],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ items?: Array<{ id: string; fullName: string }> }>("/users")
      .then((res) => {
        setOwnerOptions(
          Array.isArray(res.data?.items)
            ? res.data.items.map((u) => ({ id: u.id, fullName: u.fullName || u.id }))
            : [],
        );
      })
      .catch(() => setOwnerOptions([]));
  }, []);

  const openLead = (id: string) => patchUrl({ leadId: id });
  const closeModal = () => patchUrl({ leadId: "" });
  const openContact = (contactId: string) => {
    router.push(`/contacts?contactId=${encodeURIComponent(contactId)}`);
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextQ = qInput.trim();
    if (nextQ === urlState.q) return;
    patchUrl({ q: nextQ, page: 1 });
  };

  const applyPopoverFilters = (next: LeadsFiltersState) => {
    // Preserve attention/ids — user clears them via chips or full reset.
    patchUrl({
      ...next,
      page: 1,
    });
  };

  const resetAllFilters = () => {
    setQInput("");
    replaceUrl({ ...DEFAULT_LEADS_URL, leadId: urlState.leadId });
  };

  const filtersState: LeadsFiltersState = {
    status: urlState.status,
    source: urlState.source,
    channel: urlState.channel,
    ownerId: urlState.ownerId,
    dateFrom: urlState.dateFrom,
    dateTo: urlState.dateTo,
    sortBy: urlState.sortBy,
    sortOrder: urlState.sortOrder,
  };

  const filtersActive = isLeadsFilterActive(urlState);
  const attentionLabel = urlState.attention
    ? t.attention[urlState.attention as LeadAttentionPreset]
    : null;

  const statusOptions = useMemo(
    () => [
      { value: "", label: t.statusFilter.active },
      { value: "all", label: t.statusFilter.all },
      { value: "NEW", label: leadStatusLabel("NEW") },
      { value: "IN_PROGRESS", label: leadStatusLabel("IN_PROGRESS") },
      { value: "WON", label: leadStatusLabel("WON") },
      { value: "NOT_TARGET", label: leadStatusLabel("NOT_TARGET") },
      { value: "LOST", label: leadStatusLabel("LOST") },
      { value: "SPAM", label: leadStatusLabel("SPAM") },
    ],
    [],
  );

  const sourceOptions = useMemo(
    () => [
      { value: "", label: t.filterLabels.allSources },
      ...SOURCE_KEYS.map((value) => ({ value, label: t.sources[value] })),
    ],
    [],
  );

  const channelOptions = useMemo(
    () => [
      { value: "", label: t.channels.all },
      { value: "FB_LEAD_ADS", label: t.channels.FB_LEAD_ADS },
      { value: "IG_LEAD_ADS", label: t.channels.IG_LEAD_ADS },
      { value: "FB_DM", label: t.channels.FB_DM },
      { value: "IG_DM", label: t.channels.IG_DM },
    ],
    [],
  );

  const ownerName = (id: string) => {
    if (id === "unassigned") return t.owners.unassigned;
    return ownerOptions.find((o) => o.id === id)?.fullName ?? id;
  };

  const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (urlState.attention) {
    chips.push({
      key: "attention",
      label: t.attention[urlState.attention],
      onClear: () => patchUrl({ attention: "", page: 1 }),
    });
  }
  if (urlState.ids) {
    chips.push({
      key: "ids",
      label: t.fromPlan,
      onClear: () => patchUrl({ ids: "", page: 1 }),
    });
  }
  if (urlState.status) {
    chips.push({
      key: "status",
      label:
        urlState.status === "all"
          ? t.statusFilter.all
          : leadStatusLabel(urlState.status),
      onClear: () => patchUrl({ status: "", page: 1 }),
    });
  }
  if (urlState.source) {
    chips.push({
      key: "source",
      label: t.sources[urlState.source],
      onClear: () => patchUrl({ source: "", page: 1 }),
    });
  }
  if (urlState.channel) {
    chips.push({
      key: "channel",
      label: channelLabel(urlState.channel) ?? urlState.channel,
      onClear: () => patchUrl({ channel: "", page: 1 }),
    });
  }
  if (urlState.ownerId) {
    chips.push({
      key: "owner",
      label: ownerName(urlState.ownerId),
      onClear: () => patchUrl({ ownerId: "", page: 1 }),
    });
  }
  if (urlState.dateFrom || urlState.dateTo) {
    chips.push({
      key: "dates",
      label: `${urlState.dateFrom || "…"} → ${urlState.dateTo || "…"}`,
      onClear: () => patchUrl({ dateFrom: "", dateTo: "", page: 1 }),
    });
  }
  if (urlState.q) {
    chips.push({
      key: "q",
      label: `«${urlState.q}»`,
      onClear: () => {
        setQInput("");
        patchUrl({ q: "", page: 1 });
      },
    });
  }

  const attentionPresets: LeadAttentionPreset[] = [
    "without-touch",
    "never-contacted-new",
    "stale-in-progress",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t.pageTitle}</h1>
          <p className="text-sm text-zinc-500">{t.pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpHint routeKey="leads" />
          <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
            {t.addLead}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <form onSubmit={onSearchSubmit} className="flex items-center gap-2 rounded-xl p-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="search"
                aria-label={t.searchAriaLabel}
              />
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`relative flex shrink-0 items-center justify-center rounded p-1 hover:bg-zinc-200/50 ${
                  filtersActive ? "text-accent-600" : "text-zinc-500 hover:text-zinc-700"
                }`}
                aria-label={t.filtersTitle}
              >
                <Filter className="h-4 w-4" />
                {filtersActive ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-500" />
                ) : null}
              </button>
            </div>
          </form>

          <LeadsFiltersPopover
            open={filtersOpen}
            value={filtersState}
            statusOptions={statusOptions}
            sourceOptions={sourceOptions}
            channelOptions={channelOptions}
            ownerOptions={ownerOptions}
            onClose={() => setFiltersOpen(false)}
            onApply={applyPopoverFilters}
            onReset={resetAllFilters}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {attentionPresets.map((preset) => {
            const active = urlState.attention === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  patchUrl({
                    attention: active ? "" : preset,
                    ids: "",
                    status: "",
                    page: 1,
                  })
                }
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {t.attention[preset]}
              </button>
            );
          })}
        </div>

        {chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onClear}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {chip.label}
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:underline"
            >
              {t.resetFilters}
            </button>
          </div>
        ) : null}

        <div className="mt-2 text-sm text-zinc-500">
          {interpolate(t.totalLine, {
            total,
            page: urlState.page,
            totalPages,
          })}
          {attentionLabel ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              {attentionLabel}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <ErrorPanel message={error} onRetry={() => void reload()} />
      ) : null}

      <>
        <div className="hidden sm:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">{t.columns.namePhone}</th>
                <th className="px-4 py-3">{t.columns.city}</th>
                <th className="px-4 py-3">{t.columns.source}</th>
                <th className="px-4 py-3">{t.columns.score}</th>
                <th className="px-4 py-3">{t.columns.status}</th>
                <th className="px-4 py-3">{t.columns.owner}</th>
                <th className="px-4 py-3">{t.columns.date}</th>
                <th className="px-4 py-3 text-right">{t.columns.calls}</th>
                {extraColumns.map((col) => (
                  <th key={col.fieldId} className="px-4 py-3">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: colCount }).map((__, c) => (
                      <td key={c} className="px-4 py-4">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-6 py-16">
                    <EmptyState
                      icon={Inbox}
                      title={filtersActive || urlState.q.trim() ? t.emptyFilteredTitle : t.emptyTitle}
                      description={
                        filtersActive || urlState.q.trim() ? t.emptyFilteredHint : t.emptyHint
                      }
                      action={
                        filtersActive || urlState.q.trim() ? (
                          <button
                            type="button"
                            onClick={resetAllFilters}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            {t.resetFilters}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCreateOpen(true)}
                            className="btn-primary"
                          >
                            {t.addLead}
                          </button>
                        )
                      }
                    />
                  </td>
                </tr>
              ) : (
                items.map((l) => (
                  <tr
                    key={l.id}
                    className="cursor-pointer transition-colors hover:bg-zinc-50"
                    onClick={() => {
                      if (isTextSelected()) return;
                      openLead(l.id);
                    }}
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-zinc-900">{leadPrimaryLabel(l)}</div>
                      <div className="text-xs text-zinc-500">{l.phone || "—"}</div>
                    </td>
                    <td className="px-4 py-4 text-zinc-600">{l.city || "—"}</td>
                    <td className="px-4 py-4">
                      <span className="text-zinc-700">{sourceLabel(l.source)}</span>
                      {channelLabel(l.channel) ? (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                          {channelLabel(l.channel)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <ScoreBadge score={l.score} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge variant="lead" status={l.status} />
                    </td>
                    <td className="px-4 py-4 text-zinc-500">{l.owner?.fullName ?? "—"}</td>
                    <td className="px-4 py-4 text-zinc-500">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        {l.hasCallToday && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            {t.callToday}
                          </span>
                        )}
                        {l.hasMissedCall && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            {t.callMissed}
                          </span>
                        )}
                      </div>
                    </td>
                    {extraColumns.map((col) => (
                      <td key={col.fieldId} className="px-4 py-4 text-zinc-600">
                        {renderCellText(col, l as unknown as Record<string, unknown>, customValues)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-4">
            <span className="text-xs text-zinc-500">
              {interpolate(t.pageLine, {
                page: urlState.page,
                totalPages,
                total,
              })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={urlState.page <= 1 || loading}
                onClick={() => patchUrl({ page: Math.max(1, urlState.page - 1) })}
                className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
              >
                {t.previous}
              </button>
              <button
                type="button"
                disabled={urlState.page >= totalPages || loading}
                onClick={() => patchUrl({ page: urlState.page + 1 })}
                className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
              >
                {t.next}
              </button>
            </div>
          </div>
        </div>

        <div className="sm:hidden space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skc-${i}`} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                  <div className="mt-4 h-5 w-20 animate-pulse rounded-full bg-zinc-100" />
                  <div className="mt-4 h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={filtersActive || urlState.q.trim() ? t.emptyFilteredTitle : t.emptyTitle}
              description={
                filtersActive || urlState.q.trim() ? t.emptyFilteredHint : t.emptyHint
              }
              action={
                filtersActive || urlState.q.trim() ? (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {t.resetFilters}
                  </button>
                ) : (
                  <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
                    {t.addLead}
                  </button>
                )
              }
            />
          ) : (
            <>
              <div className="space-y-3">
                {items.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    onOpen={openLead}
                    onOpenContact={openContact}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-transparent px-2 py-4">
                <span className="text-xs text-zinc-500">
                  {interpolate(t.pageShort, { page: urlState.page, totalPages })}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={urlState.page <= 1 || loading}
                    onClick={() => patchUrl({ page: Math.max(1, urlState.page - 1) })}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    {t.previous}
                  </button>
                  <button
                    type="button"
                    disabled={urlState.page >= totalPages || loading}
                    onClick={() => patchUrl({ page: urlState.page + 1 })}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    {t.next}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </>

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg transition-opacity hover:bg-accent-600 sm:hidden"
        aria-label={t.newLead}
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      {urlState.leadId ? (
        <LeadModal
          apiBaseUrl="/api"
          leadId={urlState.leadId}
          onClose={closeModal}
          onUpdated={() => void reload({ silent: true })}
          userRole={userRole}
        />
      ) : null}

      {createOpen ? (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreated={(lead) => {
            void reload({ silent: true });
            patchUrl({ leadId: lead.id, page: 1 });
          }}
        />
      ) : null}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">{t.loading}</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}
