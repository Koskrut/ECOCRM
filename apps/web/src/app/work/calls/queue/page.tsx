"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ContactModal } from "@/app/contacts/ContactModal";
import {
  contactsApi,
  type ContactWorkQueueItem,
  type ContactWorkQueueSummaryResponse,
} from "@/lib/api/resources/contacts";
import { PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

const PAGE_SIZE = 20;

function QueueScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "border-red-200 bg-red-50 text-red-700"
      : score >= 40
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {score}
    </span>
  );
}

function nextActionLabel(value: ContactWorkQueueItem["suggestion"]["suggestedNextActionType"]) {
  switch (value) {
    case "CALL":
      return "Call";
    case "MESSAGE":
      return "Message";
    case "SEND_OFFER":
      return "Send offer";
    case "CONTROL_PAYMENT":
      return "Control payment";
    case "MEETING":
      return "Meeting";
    default:
      return "No action";
  }
}

function ManagerQueuePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ContactWorkQueueItem[]>([]);
  const [summary, setSummary] = useState<ContactWorkQueueSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState(() => searchParams.get("q") ?? "");
  const [userRole, setUserRole] = useState<string | null>(null);

  const contactId = searchParams.get("contactId");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (q.trim()) params.set("q", q.trim());
    if (contactId) params.set("contactId", contactId);
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [page, q, pathname, router, searchParams, contactId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      setPage(1);
      setQ((prev) => (prev === nextQ ? prev : nextQ));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    void fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUserRole(d?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queue, queueSummary] = await Promise.all([
        contactsApi.getWorkQueue({ page, pageSize: PAGE_SIZE, q: q.trim() || undefined }),
        contactsApi.getWorkQueueSummary({ q: q.trim() || undefined }),
      ]);
      setItems(queue.items);
      setTotal(queue.total);
      setSummary(queueSummary);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося завантажити чергу менеджера");
      setItems([]);
      setSummary(null);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const openContact = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contactId", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contactId");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Кого прозвонити сьогодні?</h1>
          <p className="text-sm text-zinc-500">
            Черга менеджера у режимі перегляду на основі пріоритетних сигналів CRM.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/work/calls" className="text-sm font-medium text-blue-600 hover:underline">
            {strings.nav.calls}
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Оновити
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">In queue</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {summary?.totalInQueue ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Overdue follow-up</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {summary?.buckets.overdueFollowup ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">New no first contact</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {summary?.buckets.newNoFirstContact ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Debt control</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {summary?.buckets.debtControl ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Avg score</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {summary?.avgPriorityScore ?? 0}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="text-sm text-zinc-600">
            Total: {total} • Page {page} / {totalPages}
          </div>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full max-w-xs rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Loading manager queue...
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 px-4 py-6 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-red-50"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Queue is empty for current filters.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {items.map((row) => (
              <button
                key={row.contact.id}
                type="button"
                onClick={() => openContact(row.contact.id)}
                className="w-full px-4 py-3 text-left transition hover:bg-zinc-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {row.contact.fullName || "Unnamed contact"}
                      </span>
                      <QueueScoreBadge score={row.priorityScore} />
                      {row.metrics.debtAmount > 0 ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Debt {row.metrics.debtAmount}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>Company: {row.contact.companyName ?? "—"}</span>
                      {row.contact.ownerName ? <span>Owner: {row.contact.ownerName}</span> : null}
                      <span>
                        Last contact:{" "}
                        {row.metrics.daysSinceLastContact != null
                          ? `${row.metrics.daysSinceLastContact} d ago`
                          : "no contact yet"}
                      </span>
                      <span>
                        Suggested: {nextActionLabel(row.suggestion.suggestedNextActionType)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.priorityReasons.slice(0, 3).map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <span className="text-xs text-zinc-500">
            Showing {items.length} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {contactId ? (
        <ContactModal
          apiBaseUrl="/api"
          contactId={contactId}
          initialCreate={
            contactId === "new"
              ? {
                  phone: searchParams.get("phone") ?? undefined,
                }
              : undefined
          }
          userRole={userRole}
          onClose={closeModal}
          onCreated={openContact}
          onUpdate={() => void load()}
        />
      ) : null}
    </div>
  );
}

export default function ManagerQueuePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ManagerQueuePageContent />
    </Suspense>
  );
}
