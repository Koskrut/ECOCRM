"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Search } from "lucide-react";
import {
  leadsApi,
  type Lead,
  type LeadsResponse,
  type LeadStatus,
  type LeadSource,
} from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadModal } from "./LeadModal";
import { CreateLeadModal } from "./CreateLeadModal";
import { LeadsFiltersPopover, type LeadsFiltersState } from "./LeadsFiltersPopover";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "NEW", label: "New" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WON", label: "Won" },
  { value: "NOT_TARGET", label: "Not target" },
  { value: "LOST", label: "Lost" },
  { value: "SPAM", label: "Spam" },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All sources" },
  { value: "META", label: "Meta" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WEBSITE", label: "Website" },
  { value: "OTHER", label: "Other" },
];

function LeadsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const leadId = searchParams.get("leadId");
  const [createOpen, setCreateOpen] = useState(false);

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
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState(() => searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (leadId) params.set("leadId", leadId);
    if (page > 1) params.set("page", String(page));
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    if (q) params.set("q", q);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [leadId, page, pathname, q, router, searchParams, source, status]);

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
    [page, pageSize, q, source, status],
  );

  useEffect(() => {
    void reload({ keepPage: true });
  }, [reload]);

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
    setPage(1);
  };

  const resetAllFilters = () => {
    setStatus("");
    setSource("");
    setQInput("");
    setQ("");
    setPage(1);
  };

  const filtersState: LeadsFiltersState = { status, source };

  const goToPage = (next: number) => {
    setPage(next);
    void reload({ keepPage: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-zinc-500">Incoming inquiries and potential customers</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="btn-primary"
        >
          + Lead
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
                placeholder="Search by name, phone, email, company, message"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="search"
                aria-label="Search leads"
              />
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                aria-label="Open filters"
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </form>

          <LeadsFiltersPopover
            open={filtersOpen}
            value={filtersState}
            statusOptions={STATUS_OPTIONS}
            sourceOptions={SOURCE_OPTIONS}
            onClose={() => setFiltersOpen(false)}
            onApply={applyPopoverFilters}
            onReset={resetAllFilters}
          />
        </div>
        <div className="mt-2 text-sm text-zinc-500">
          Total: {total} | Page {page} of {totalPages}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name / Phone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Calls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  No leads
                </td>
              </tr>
            ) : (
              items.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer transition-colors hover:bg-zinc-50"
                  onClick={() => openLead(l.id)}
                >
                  <td className="px-4 py-4">
                    <div className="font-medium text-zinc-900">
                      {l.fullName || l.name || [l.firstName, l.lastName].filter(Boolean).join(" ") || l.companyName || "No name"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {l.phone || l.email || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-zinc-600">{l.city ?? "—"}</td>
                  <td className="px-4 py-4 text-zinc-700">
                    {l.source}
                    {l.channel ? ` / ${l.channel}` : ""}
                  </td>
                  <td className="px-4 py-4 text-zinc-600">
                    {typeof l.score === "number" ? l.score : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge variant="lead" status={l.status} />
                  </td>
                  <td className="px-4 py-4 text-zinc-500">
                    {l.owner?.fullName ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      {l.hasCallToday && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 border border-emerald-200">
                          Call today
                        </span>
                      )}
                      {l.hasMissedCall && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 border border-red-200">
                          Missed
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-4">
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages} • Total {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {leadId && (
        <LeadModal
          apiBaseUrl="/api"
          leadId={leadId}
          onClose={closeModal}
          onUpdated={() => void reload({ keepPage: true })}
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
