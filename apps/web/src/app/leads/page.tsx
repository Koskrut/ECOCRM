"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Inbox, Search } from "lucide-react";
import {
  leadsApi,
  type Lead,
  type LeadsResponse,
  type LeadStatus,
  type LeadSource,
  type LeadChannel,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadModal } from "./LeadModal";
import { CreateLeadModal } from "./CreateLeadModal";
import { LeadsFiltersPopover, DEFAULT_LEADS_FILTERS, isActiveFilterState, type LeadsFiltersState } from "./LeadsFiltersPopover";
import { LeadCard } from "./LeadCard";
import { formatDate } from "@/lib/crmDatetime";
import { useListColumns } from "@/lib/lists/useListColumns";
import { renderCellText } from "@/lib/lists/renderCell";

function leadPrimaryLabel(lead: Lead): string {
  const personName = [lead.lastName, lead.firstName, lead.middleName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return personName || lead.companyName || lead.fullName || lead.name || "—";
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Активні" },
  { value: "NEW", label: "Нові" },
  { value: "IN_PROGRESS", label: "В роботі" },
  { value: "WON", label: "Успішні" },
  { value: "NOT_TARGET", label: "Нецільові" },
  { value: "LOST", label: "Програні" },
  { value: "SPAM", label: "Спам" },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі джерела" },
  { value: "META", label: "Meta" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WEBSITE", label: "Website" },
  { value: "RINGOSTAT", label: "Ringostat" },
  { value: "OTHER", label: "Інше" },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі канали" },
  { value: "FB_LEAD_ADS", label: "FB Lead Ads" },
  { value: "IG_LEAD_ADS", label: "IG Lead Ads" },
  { value: "FB_DM", label: "FB DM" },
  { value: "IG_DM", label: "IG DM" },
];

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);
const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  CHANNEL_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

function sourceLabel(source?: string | null): string {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source;
}

function channelLabel(channel?: string | null): string | null {
  if (!channel) return null;
  return CHANNEL_LABELS[channel] ?? channel;
}

function scoreTone(score: number): string {
  if (score >= 70) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 40) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (typeof score !== "number") {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <span
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(score)}`}
    >
      {score}
    </span>
  );
}

function LeadsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const leadId = searchParams.get("leadId");
  const [createOpen, setCreateOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [source, setSource] = useState(() => searchParams.get("source") ?? "");
  const [channel, setChannel] = useState(() => searchParams.get("channel") ?? "");
  const [ownerId, setOwnerId] = useState(() => searchParams.get("ownerId") ?? "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") ?? "");
  const [sortBy, setSortBy] = useState(
    () => searchParams.get("sortBy") ?? DEFAULT_LEADS_FILTERS.sortBy,
  );
  const [sortOrder, setSortOrder] = useState(
    () => searchParams.get("sortOrder") ?? DEFAULT_LEADS_FILTERS.sortOrder,
  );
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState(() => searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ id: string; fullName: string }>>([]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const { extraColumns, customValues, loadValuesFor } = useListColumns("LEAD");
  const colCount = 8 + extraColumns.length;

  useEffect(() => {
    if (items.length === 0) return;
    void loadValuesFor(items.map((l) => l.id));
  }, [items, loadValuesFor]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (leadId) params.set("leadId", leadId);
    if (page > 1) params.set("page", String(page));
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    if (channel) params.set("channel", channel);
    if (ownerId) params.set("ownerId", ownerId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy && sortBy !== DEFAULT_LEADS_FILTERS.sortBy) params.set("sortBy", sortBy);
    if (sortOrder && sortOrder !== DEFAULT_LEADS_FILTERS.sortOrder) params.set("sortOrder", sortOrder);
    if (q) params.set("q", q);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [channel, dateFrom, dateTo, leadId, ownerId, page, pathname, q, router, searchParams, sortBy, sortOrder, source, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      setPage(1);
      setQ((prev) => (prev === nextQ ? prev : nextQ));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const reload = useCallback(
    async (opts?: { keepPage?: boolean }) => {
      try {
        setLoading(true);
        setError(null);

        const effectivePage = opts?.keepPage ? page : 1;
        if (!opts?.keepPage) setPage(1);

        const params: Parameters<typeof leadsApi.list>[0] = {
          page: effectivePage,
          pageSize,
        };
        if (status) params.status = status as LeadStatus;
        if (source) params.source = source as LeadSource;
        if (channel) params.channel = channel as LeadChannel;
        if (ownerId) params.ownerId = ownerId;
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (sortBy) params.sortBy = sortBy as "createdAt" | "score";
        if (sortOrder) params.sortOrder = sortOrder as "asc" | "desc";
        if (q.trim()) params.q = q.trim();

        const res: LeadsResponse = await leadsApi.list(params);
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to load leads");
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [channel, dateFrom, dateTo, ownerId, page, pageSize, q, sortBy, sortOrder, source, status],
  );

  useEffect(() => {
    void reload({ keepPage: true });
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

  const openLead = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("leadId", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("leadId");
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl);
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  const applyPopoverFilters = (next: LeadsFiltersState) => {
    setStatus(next.status);
    setSource(next.source);
    setChannel(next.channel);
    setOwnerId(next.ownerId);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const resetAllFilters = () => {
    setStatus("");
    setSource("");
    setChannel("");
    setOwnerId("");
    setDateFrom("");
    setDateTo("");
    setSortBy(DEFAULT_LEADS_FILTERS.sortBy);
    setSortOrder(DEFAULT_LEADS_FILTERS.sortOrder);
    setQInput("");
    setQ("");
    setPage(1);
  };

  const filtersState: LeadsFiltersState = {
    status,
    source,
    channel,
    ownerId,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  };

  const filtersActive = isActiveFilterState(filtersState);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ліди</h1>
          <p className="text-sm text-zinc-500">Вхідні звернення та потенційні клієнти</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="btn-primary"
        >
          + Лід
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <form
            onSubmit={onSearchSubmit}
            className="flex items-center gap-2 rounded-xl p-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Пошук за ім'ям, телефоном, email, компанією, містом…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="search"
                aria-label="Пошук лідів"
              />
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`relative flex shrink-0 items-center justify-center rounded p-1 hover:bg-zinc-200/50 ${
                  filtersActive ? "text-accent-600" : "text-zinc-500 hover:text-zinc-700"
                }`}
                aria-label="Відкрити фільтри"
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
            statusOptions={STATUS_OPTIONS}
            sourceOptions={SOURCE_OPTIONS}
            channelOptions={CHANNEL_OPTIONS}
            ownerOptions={ownerOptions}
            onClose={() => setFiltersOpen(false)}
            onApply={applyPopoverFilters}
            onReset={resetAllFilters}
          />
        </div>
        <div className="mt-2 text-sm text-zinc-500">
          Усього: {total} · Сторінка {page} з {totalPages}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm text-sm text-red-700">
          {error}
        </div>
      )}

      <>
        {/* Desktop + tablet: table */}
        <div className="hidden sm:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Ім&apos;я / телефон</th>
                <th className="px-4 py-3">Місто</th>
                <th className="px-4 py-3">Джерело</th>
                <th className="px-4 py-3">Бал</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Відповідальний</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3 text-right">Дзвінки</th>
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
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-700">
                          {filtersActive || q.trim() ? "Нічого не знайдено" : "Лідів поки немає"}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {filtersActive || q.trim()
                            ? "Спробуйте змінити фільтри або пошуковий запит"
                            : "Створіть перший лід, щоб почати роботу"}
                        </p>
                      </div>
                      {filtersActive || q.trim() ? (
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          Скинути фільтри
                        </button>
                      ) : (
                        <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
                          + Лід
                        </button>
                      )}
                    </div>
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
                      <div className="font-medium text-zinc-900">
                        {leadPrimaryLabel(l)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {l.phone || "—"}
                      </div>
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
                    <td className="px-4 py-4 text-zinc-500">
                      {l.owner?.fullName ?? "—"}
                    </td>
                    <td className="px-4 py-4 text-zinc-500">
                      {formatDate(l.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        {l.hasCallToday && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Сьогодні
                          </span>
                        )}
                        {l.hasMissedCall && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            Пропущено
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
              Сторінка {page} з {totalPages} • Всього {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
              >
                Вперед
              </button>
            </div>
          </div>
        </div>

        {/* Mobile: card list */}
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
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                <Inbox className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700">
                  {filtersActive || q.trim() ? "Нічого не знайдено" : "Лідів поки немає"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {filtersActive || q.trim()
                    ? "Спробуйте змінити фільтри або пошук"
                    : "Створіть перший лід, щоб почати"}
                </p>
              </div>
              {filtersActive || q.trim() ? (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Скинути фільтри
                </button>
              ) : (
                <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
                  + Лід
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {items.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={openLead} />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-transparent px-2 py-4">
                <span className="text-xs text-zinc-500">
                  Сторінка {page}/{totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Вперед
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
        aria-label="Новий лід"
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      {leadId && (
        <LeadModal
          apiBaseUrl="/api"
          leadId={leadId}
          onClose={closeModal}
          onUpdated={() => void reload({ keepPage: true })}
          userRole={userRole}
        />
      )}

      {createOpen && (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => void reload({ keepPage: true })}
        />
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}
