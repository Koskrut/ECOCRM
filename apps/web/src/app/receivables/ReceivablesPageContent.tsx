"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/feedback";
import { KyivstarDialButton } from "@/components/kyivstar/KyivstarDialButton";
import { CRM_TIME_ZONE, formatDate, kyivStartOfDayFromYmd, ymdDaysAgoInKyiv } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";
import { DateTime } from "luxon";
import {
  buildReceivablesSearchParams,
  parseReceivablesFilters,
  type ReceivablesTab,
  type ReceivablesWorkView,
} from "./receivables-url";
import { pickTodayCollectQueue } from "./debt-promise";
import {
  receivablesApi,
  type ReceivablesReconcileStatus,
  type ReceivablesSnapshot,
  type ReconciliationLine,
  type ContactReceivablesResponse,
  type PeriodPaymentRow,
  type WorkClientRow,
  type WorkOrderRow,
} from "@/lib/api/resources/receivables";
import { DebtCommentDialog } from "./DebtCommentDialog";
import { useEntityModalStack, type EntityModalFrame } from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";

type AgingChip = "" | "0-7" | "8-30" | "30+";

type Tab = ReceivablesTab;
type WorkView = ReceivablesWorkView;

type MeResponse = { user?: { role?: string; id?: string } };
type ManagerOption = { id: string; fullName: string };

const RECONCILE_STATUS_LABELS: Record<ReceivablesReconcileStatus, string> = {
  ALIGNED: "Збіг",
  DELTA_1C_MORE: "1С більше",
  DELTA_CRM_MORE: "CRM більше",
  ONLY_1C: "Тільки в 1С",
  ONLY_CRM: "Тільки в CRM",
};

const FINANCIAL_LABELS: Record<string, string> = {
  INVOICE_PENDING: "Потрібно виставити рахунок",
  AWAITING_PAYMENT: "Очікуємо оплату",
  DUE_SOON: "Термін скоро",
  OVERDUE: "Прострочено",
  PAID: "Оплачено",
  CLOSED: "Закрито",
};

const RECONCILE_STATUS_CLASS: Record<ReceivablesReconcileStatus, string> = {
  ALIGNED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELTA_1C_MORE: "bg-amber-50 text-amber-800 ring-amber-200",
  DELTA_CRM_MORE: "bg-orange-50 text-orange-800 ring-orange-200",
  ONLY_1C: "bg-red-50 text-red-700 ring-red-200",
  ONLY_CRM: "bg-violet-50 text-violet-800 ring-violet-200",
};

function formatMoney(amount: number, currency: string) {
  const sym = currency === "EUR" ? "€" : "$";
  return `${amount.toFixed(2)} ${sym}`;
}

function matchesAging(days: number | undefined, chip: AgingChip): boolean {
  if (!chip) return true;
  const d = Math.max(Number(days) || 0, 0);
  if (chip === "0-7") return d <= 7;
  if (chip === "8-30") return d >= 8 && d <= 30;
  return d > 30;
}

async function copyPendingPayLink(orderId: string): Promise<boolean> {
  const r = await fetch(`/api/orders/${orderId}/payment-requests`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!r.ok) return false;
  const data = (await r.json()) as Array<{ effectiveStatus?: string; publicToken?: string }>;
  const pending = (Array.isArray(data) ? data : []).find(
    (row) => row.effectiveStatus === "PENDING" && row.publicToken,
  );
  if (!pending?.publicToken) return false;
  await navigator.clipboard.writeText(`${window.location.origin}/pay/${pending.publicToken}`);
  return true;
}

function KpiCard({
  title,
  value,
  subtitle,
  variant = "default",
}: {
  title: string;
  value: string;
  subtitle?: string;
  variant?: "default" | "risk" | "ok";
}) {
  const ring =
    variant === "risk"
      ? "border-red-200 bg-red-50"
      : variant === "ok"
        ? "border-emerald-200 bg-emerald-50"
        : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${ring}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-zinc-500">{subtitle}</div> : null}
    </div>
  );
}

export function ReceivablesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const t = strings.receivables;

  const [initialFilters] = useState(() => parseReceivablesFilters(searchParams));
  const contactId = searchParams.get("contactId") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  const root = useMemo<EntityModalFrame | null>(() => {
    if (contactId) return { type: "contact", id: contactId };
    if (orderId) return { type: "order", id: orderId };
    return null;
  }, [contactId, orderId]);
  const stack = useEntityModalStack(root);

  const [tab, setTab] = useState<Tab>(initialFilters.tab);
  const [workView, setWorkView] = useState<WorkView>(initialFilters.workView);
  const [overdue, setOverdue] = useState(initialFilters.overdue);
  const [needsComment, setNeedsComment] = useState(initialFilters.needsComment);
  const [promisedToday, setPromisedToday] = useState(initialFilters.promisedToday);
  const [promiseBroken, setPromiseBroken] = useState(initialFilters.promiseBroken);
  const [aging, setAging] = useState<AgingChip>("");
  const [deltasOnly, setDeltasOnly] = useState(initialFilters.deltasOnly);
  const [reconcileStatus, setReconcileStatus] = useState(initialFilters.reconcileStatus);
  const [snapshotId, setSnapshotId] = useState(initialFilters.snapshotId);
  const [ownerId, setOwnerId] = useState(initialFilters.ownerId);
  const [q, setQ] = useState(initialFilters.q);
  const [qInput, setQInput] = useState(initialFilters.q);
  const [clientId, setClientId] = useState(initialFilters.clientId);
  const [clientFilterName, setClientFilterName] = useState("");

  const [role, setRole] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [snapshots, setSnapshots] = useState<ReceivablesSnapshot[]>([]);
  const [workSummary, setWorkSummary] = useState<Awaited<
    ReturnType<typeof receivablesApi.workSummary>
  >["data"] | null>(null);
  const [reconcileSummary, setReconcileSummary] = useState<Awaited<
    ReturnType<typeof receivablesApi.reconciliationSummary>
  >["data"] | null>(null);
  const [workClients, setWorkClients] = useState<WorkClientRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [reconcileRows, setReconcileRows] = useState<ReconciliationLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDate, setUploadDate] = useState(() => ymdDaysAgoInKyiv(0));
  const [uploadNote, setUploadNote] = useState("");
  const [uploadCurrency, setUploadCurrency] = useState("USD");
  const [uploading, setUploading] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{
    contactId: string;
    clientName: string;
  } | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [clientDetails, setClientDetails] = useState<
    Map<string, ContactReceivablesResponse>
  >(new Map());
  const [clientDetailsLoading, setClientDetailsLoading] = useState<Set<string>>(new Set());
  const [periodPaidFrom, setPeriodPaidFrom] = useState(() => ymdDaysAgoInKyiv(30));
  const [periodPaidTo, setPeriodPaidTo] = useState(() => ymdDaysAgoInKyiv(0));
  const [periodPayments, setPeriodPayments] = useState<PeriodPaymentRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = role === "ADMIN" || role === "LEAD";
  const currency = workSummary?.currency ?? reconcileSummary?.currency ?? "USD";
  const selectedSnapshot = snapshots.find((s) => s.id === snapshotId) ?? snapshots[0] ?? null;

  const urlState = useMemo(
    () => ({
      tab,
      workView,
      overdue,
      needsComment,
      promisedToday,
      promiseBroken,
      deltasOnly,
      reconcileStatus,
      snapshotId,
      ownerId,
      q,
      clientId,
      contactId,
      orderId,
    }),
    [
      tab,
      workView,
      overdue,
      needsComment,
      promisedToday,
      promiseBroken,
      deltasOnly,
      reconcileStatus,
      snapshotId,
      ownerId,
      q,
      clientId,
      contactId,
      orderId,
    ],
  );

  const replaceUrl = useCallback(
    (next: typeof urlState) => {
      const params = buildReceivablesSearchParams(next);
      const query = params.toString();
      const target = query ? `${pathname}?${query}` : pathname;
      const current = searchParams.toString();
      if (query === current) return;
      router.replace(target, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    replaceUrl(urlState);
  }, [replaceUrl, urlState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      setQ((prev) => (prev === nextQ ? prev : nextQ));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => {
        setRole(res.data?.user?.role ?? null);
        setMeId(res.data?.user?.id ?? null);
      })
      .catch(() => {
        setRole(null);
        setMeId(null);
      });
  }, []);

  useEffect(() => {
    if (role !== "ADMIN" && role !== "LEAD") return;
    apiHttp
      .get<{ items?: Array<{ id: string; fullName?: string; email?: string; role?: string }> }>(
        "/users",
      )
      .then((res) => {
        const list = res.data?.items ?? [];
        const options = list
          .filter((u) => u.role === "MANAGER" || u.role === "LEAD")
          .map((u) => ({
            id: u.id,
            fullName:
              u.id === meId && role === "LEAD"
                ? `${u.fullName?.trim() || u.email || u.id} (${t.myPortfolio})`
                : u.fullName?.trim() || u.email || u.id,
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "uk"));
        setManagers(options);
      })
      .catch(() => setManagers([]));
  }, [role, meId, t.myPortfolio]);

  const loadSnapshots = useCallback(async () => {
    const res = await receivablesApi.listSnapshots(30);
    const items = res.data.items ?? [];
    setSnapshots(items);
    setSnapshotId((prev) => prev || items[0]?.id || "");
    return items;
  }, []);

  const loadWork = useCallback(async () => {
    const [summaryRes, listRes] = await Promise.all([
      receivablesApi.workSummary(ownerId || undefined),
      workView === "orders"
        ? receivablesApi.workOrders({
            ownerId: ownerId || undefined,
            q: q || undefined,
            overdue: overdue || undefined,
            clientId: clientId || undefined,
            page: 1,
            pageSize: 100,
          })
        : receivablesApi.workClients({
            ownerId: ownerId || undefined,
            q: q || undefined,
            overdue: overdue || undefined,
            needsComment: needsComment || undefined,
            promisedToday: promisedToday || undefined,
            promiseBroken: promiseBroken || undefined,
            page: 1,
            pageSize: 100,
          }),
    ]);
    const items = listRes.data.items ?? [];
    return {
      summary: summaryRes.data,
      orders: workView === "orders" ? (items as WorkOrderRow[]) : [],
      clients: workView === "orders" ? [] : (items as WorkClientRow[]),
    };
  }, [ownerId, q, overdue, needsComment, promisedToday, promiseBroken, workView, clientId]);

  const loadPeriodPayments = useCallback(async () => {
    const res = await receivablesApi.periodPayments({
      paidFrom: periodPaidFrom ? kyivStartOfDayFromYmd(periodPaidFrom).toISOString() : undefined,
      paidTo: periodPaidTo
        ? DateTime.fromISO(periodPaidTo, { zone: CRM_TIME_ZONE }).endOf("day").toUTC().toISO() ??
          undefined
        : undefined,
      ownerId: ownerId || undefined,
      page: 1,
      pageSize: 100,
    });
    return res.data.items ?? [];
  }, [periodPaidFrom, periodPaidTo, ownerId]);

  const toggleClientExpand = useCallback(async (contactIdToToggle: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(contactIdToToggle)) next.delete(contactIdToToggle);
      else next.add(contactIdToToggle);
      return next;
    });
    if (clientDetails.has(contactIdToToggle)) return;
    setClientDetailsLoading((prev) => new Set(prev).add(contactIdToToggle));
    try {
      const res = await receivablesApi.contactReceivables(contactIdToToggle, {
        paymentsPage: 1,
        paymentsPageSize: 50,
        ordersPage: 1,
        ordersPageSize: 100,
      });
      setClientDetails((prev) => new Map(prev).set(contactIdToToggle, res.data));
    } catch {
      pushToast(t.loadError, "error");
    } finally {
      setClientDetailsLoading((prev) => {
        const next = new Set(prev);
        next.delete(contactIdToToggle);
        return next;
      });
    }
  }, [clientDetails, pushToast, t.loadError]);

  const loadReconcile = useCallback(async () => {
    const sid = snapshotId;
    if (!sid) {
      return { summary: null, rows: [] as ReconciliationLine[] };
    }
    const [summaryRes, listRes] = await Promise.all([
      receivablesApi.reconciliationSummary(sid, ownerId || undefined),
      receivablesApi.listReconciliation({
        snapshotId: sid,
        ownerId: ownerId || undefined,
        q: q || undefined,
        deltasOnly: reconcileStatus ? false : deltasOnly,
        status: reconcileStatus || undefined,
        page: 1,
        pageSize: 200,
      }),
    ]);
    return { summary: summaryRes.data, rows: listRes.data.items ?? [] };
  }, [snapshotId, ownerId, q, deltasOnly, reconcileStatus]);

  const applyWorkResult = useCallback((data: Awaited<ReturnType<typeof loadWork>>) => {
    setWorkSummary(data.summary);
    setWorkOrders(data.orders);
    setWorkClients(data.clients);
  }, []);

  const applyReconcileResult = useCallback((data: Awaited<ReturnType<typeof loadReconcile>>) => {
    setReconcileSummary(data.summary);
    setReconcileRows(data.rows);
  }, []);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      await loadSnapshots();
      if (tab === "work") {
        applyWorkResult(await loadWork());
        try {
          setPeriodPayments(await loadPeriodPayments());
        } catch {
          setPeriodPayments([]);
        }
      } else applyReconcileResult(await loadReconcile());
    } catch {
      pushToast(t.loadError, "error");
    } finally {
      setLoading(false);
    }
  }, [loadSnapshots, loadWork, loadPeriodPayments, loadReconcile, applyWorkResult, applyReconcileResult, tab, pushToast, t.loadError]);

  const replaceModalRoot = useCallback(
    (nextContactId: string, nextOrderId: string) => {
      replaceUrl({ ...urlState, contactId: nextContactId, orderId: nextOrderId });
    },
    [replaceUrl, urlState],
  );

  const openContact = (id: string) => {
    if (root) {
      stack.open({ type: "contact", id });
      return;
    }
    stack.closeAll();
    replaceModalRoot(id, "");
  };

  const openOrder = (id: string) => {
    if (root) {
      stack.open({ type: "order", id });
      return;
    }
    stack.closeAll();
    replaceModalRoot("", id);
  };

  const closeFrom = (index: number) => {
    if (index <= 0) {
      stack.closeAll();
      replaceModalRoot("", "");
      return;
    }
    stack.closeFrom(index);
  };

  const replaceRoot = (frame: EntityModalFrame) => {
    // Nested contact→order→company stays in the overlay stack.
    // Only a new contact becoming a real id should replace the URL root.
    if (frame.type === "contact") replaceModalRoot(frame.id, "");
  };

  const handleCopyPay = async (row: WorkClientRow) => {
    if (!row.primaryOrderId) {
      pushToast(t.payLinkMissing, "info");
      return;
    }
    try {
      const copied = await copyPendingPayLink(row.primaryOrderId);
      if (copied) {
        pushToast(t.payLinkCopied, "success");
        return;
      }
    } catch {
      // Fall through to the order modal.
    }
    pushToast(t.payLinkMissing, "info");
    openOrder(row.primaryOrderId);
  };

  const visibleClients = useMemo(
    () => workClients.filter((row) => matchesAging(row.overdueDays, aging)),
    [workClients, aging],
  );
  const todayQueue = useMemo(() => pickTodayCollectQueue(visibleClients), [visibleClients]);
  const queueCoverPct =
    todayQueue.overdueTotal > 0
      ? Math.round((todayQueue.overdueCovered / todayQueue.overdueTotal) * 100)
      : 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSnapshots();
      } catch {
        if (!cancelled) pushToast(t.loadError, "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSnapshots, pushToast, t.loadError]);

  useEffect(() => {
    if (tab !== "work") return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await loadWork();
        if (cancelled) return;
        applyWorkResult(data);
      } catch {
        if (!cancelled) pushToast(t.loadError, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadWork, applyWorkResult, pushToast, t.loadError]);

  useEffect(() => {
    if (tab !== "work") return;
    let cancelled = false;
    (async () => {
      try {
        const items = await loadPeriodPayments();
        if (!cancelled) setPeriodPayments(items);
      } catch {
        if (!cancelled) setPeriodPayments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadPeriodPayments]);

  useEffect(() => {
    if (tab !== "reconcile") return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await loadReconcile();
        if (cancelled) return;
        applyReconcileResult(data);
      } catch {
        if (!cancelled) pushToast(t.loadError, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadReconcile, applyReconcileResult, pushToast, t.loadError]);

  useEffect(() => {
    if (tab === "reconcile" && !snapshotId && snapshots[0]) {
      setSnapshotId(snapshots[0].id);
    }
  }, [tab, snapshotId, snapshots]);

  useEffect(() => {
    if (!clientId || clientFilterName) return;
    const fromOrders = workOrders.find((row) => row.clientId === clientId);
    if (fromOrders?.clientName) {
      setClientFilterName(fromOrders.clientName);
      return;
    }
    const fromClients = workClients.find((row) => row.contactId === clientId);
    if (fromClients?.clientName) setClientFilterName(fromClients.clientName);
  }, [clientId, clientFilterName, workOrders, workClients]);

  const handleRefreshReconcile = async () => {
    const sid = snapshotId;
    if (!sid) return;
    setRefreshing(true);
    try {
      await receivablesApi.refreshReconciliation(sid);
      applyReconcileResult(await loadReconcile());
      applyWorkResult(await loadWork());
      pushToast(t.refreshSuccess, "success");
    } catch {
      pushToast(t.refreshError, "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("snapshotDate", uploadDate);
      fd.append("currency", uploadCurrency);
      if (uploadNote.trim()) fd.append("note", uploadNote.trim());
      const res = await receivablesApi.uploadSnapshot(fd);
      pushToast(t.uploadSuccess, "success");
      setUploadOpen(false);
      setUploadNote("");
      setTab("reconcile");
      setSnapshotId(res.data.id);
      await reload({ silent: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.uploadError;
      pushToast(msg || t.uploadError, "error");
    } finally {
      setUploading(false);
    }
  };

  const reconciliationBanner = useMemo(() => {
    const rec = workSummary?.reconciliation;
    if (!rec) return null;
    if (rec.isAligned) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t.reconcileOk(formatDate(rec.snapshotDate.slice(0, 10)))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{t.reconcileWarning(rec.managerDeltaCount)}</span>
        {canUpload ? (
          <button
            type="button"
            onClick={() => {
              setTab("reconcile");
              setSnapshotId(rec.snapshotId);
            }}
            className="font-medium underline underline-offset-2"
          >
            {t.openReconcile}
          </button>
        ) : null}
      </div>
    );
  }, [workSummary, canUpload, t]);

  const workHasRows = workView === "orders" ? workOrders.length > 0 : workClients.length > 0;
  const reconcileHasRows = reconcileRows.length > 0;
  const showWorkSpinner = loading && !workHasRows;
  const showReconcileSpinner = loading && snapshots.length === 0;

  return (
    <>
      <PageShell
        title={t.pageTitle}
        subtitle={t.pageSubtitle}
        helpRouteKey="receivables"
        banner={tab === "work" ? reconciliationBanner : undefined}
        actions={
          tab === "reconcile" ? (
            <div className="flex flex-wrap gap-2">
              {canUpload ? (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  <Upload className="h-4 w-4" />
                  {t.upload}
                </button>
              ) : null}
              <button
                type="button"
                disabled={refreshing || !selectedSnapshot}
                onClick={() => void handleRefreshReconcile()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {t.refresh}
              </button>
            </div>
          ) : null
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setTab("work")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "work" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {t.tabWork}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("reconcile");
                if (!snapshotId && snapshots[0]) setSnapshotId(snapshots[0].id);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "reconcile" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {t.tabReconcile}
            </button>
          </div>

          {(role === "ADMIN" || role === "LEAD") && managers.length > 0 ? (
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">{t.allManagers}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          ) : null}

          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(qInput.trim());
            }}
            placeholder={t.searchPlaceholder}
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm sm:max-w-xs"
          />
          {loading && (workHasRows || reconcileHasRows) ? (
            <span className="text-xs text-zinc-400">{t.updating}</span>
          ) : null}
        </div>

        {tab === "work" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={t.kpiDebtOperational}
                value={formatMoney(workSummary?.kpi.debtTotal ?? 0, currency)}
                variant="risk"
              />
              <KpiCard
                title={t.kpiOverdue}
                value={formatMoney(workSummary?.kpi.overdueDebt ?? 0, currency)}
                variant="risk"
              />
              <KpiCard
                title={t.kpiClients}
                value={String(workSummary?.kpi.clientsWithDebtCount ?? 0)}
              />
              <KpiCard
                title={t.kpiOrders}
                value={String(workSummary?.kpi.ordersWithDebtCount ?? 0)}
              />
              <KpiCard
                title={t.kpiBitrixLegacy}
                value={formatMoney(workSummary?.kpi.bitrixLegacyDebt ?? 0, currency)}
                subtitle={t.kpiBitrixLegacyHint}
              />
              <KpiCard
                title={t.kpiPromisedToday}
                value={formatMoney(workSummary?.kpi.promisedTodayAmount ?? 0, currency)}
                subtitle={String(workSummary?.kpi.promisedTodayCount ?? 0)}
              />
              <KpiCard
                title={t.kpiCollectedToday}
                value={formatMoney(workSummary?.kpi.collectedTodayAmount ?? 0, currency)}
                variant="ok"
              />
            </div>

            {workView === "clients" ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900">{t.todayQueueTitle}</h2>
                  {todayQueue.items.length > 0 && todayQueue.overdueTotal > 0 ? (
                    <p className="text-xs text-zinc-500">
                      {t.todayQueuePareto(todayQueue.items.length, queueCoverPct)}
                    </p>
                  ) : null}
                </div>
                {todayQueue.items.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">{t.todayQueueEmpty}</p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {todayQueue.items.map((row) => (
                      <div
                        key={row.contactId}
                        className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                      >
                        <button
                          type="button"
                          className="text-left text-sm font-medium text-zinc-900 underline-offset-2 hover:underline"
                          onClick={() => openContact(row.contactId)}
                        >
                          {row.clientName}
                        </button>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                          <span className="font-semibold tabular-nums text-red-700">
                            {formatMoney(row.overdueAmount || row.debtAmount, currency)}
                          </span>
                          {row.overdueDays ? (
                            <span>{t.overdueDaysShort(row.overdueDays)}</span>
                          ) : null}
                          {row.promiseDate ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200">
                              {t.promiseDate}: {row.promiseDate}
                            </span>
                          ) : null}
                        </div>
                        {row.lastCommentPreview ? (
                          <p className="line-clamp-2 text-xs text-zinc-500">{row.lastCommentPreview}</p>
                        ) : (
                          <p className="text-xs text-amber-700">{t.commentNone}</p>
                        )}
                        <ClientRowActions
                          row={row}
                          onComment={(next) =>
                            setCommentTarget({
                              contactId: next.contactId,
                              clientName: next.clientName,
                            })
                          }
                          onCopyPay={(next) => void handleCopyPay(next)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setWorkView("clients");
                    setClientId("");
                    setClientFilterName("");
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    workView === "clients"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {t.viewClients}
                </button>
                <button
                  type="button"
                  onClick={() => setWorkView("orders")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    workView === "orders"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {t.viewOrders}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={overdue}
                  onChange={(e) => setOverdue(e.target.checked)}
                />
                {t.overdueOnly}
              </label>
              {workView === "clients" ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={needsComment}
                      onChange={(e) => setNeedsComment(e.target.checked)}
                    />
                    {t.needsCommentOnly}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={promisedToday}
                      onChange={(e) => setPromisedToday(e.target.checked)}
                    />
                    {t.promisedTodayOnly}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={promiseBroken}
                      onChange={(e) => setPromiseBroken(e.target.checked)}
                    />
                    {t.promiseBrokenOnly}
                  </label>
                  <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
                    {(
                      [
                        ["", t.agingAll],
                        ["0-7", t.aging0to7],
                        ["8-30", t.aging8to30],
                        ["30+", t.aging30plus],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value || "all"}
                        type="button"
                        onClick={() => setAging(value)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          aging === value
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {workView === "orders" && clientId ? (
                <button
                  type="button"
                  onClick={() => {
                    setClientId("");
                    setClientFilterName("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                  title={t.clearClientFilter}
                >
                  {t.filterByClient}
                  {clientFilterName ? `: ${clientFilterName}` : ""}
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </div>

            {showWorkSpinner ? (
              <div className="text-sm text-zinc-500">{strings.common.loading}</div>
            ) : workView === "clients" ? (
              <>
                <WorkClientsTable
                  rows={visibleClients}
                  currency={currency}
                  expandedClients={expandedClients}
                  clientDetails={clientDetails}
                  clientDetailsLoading={clientDetailsLoading}
                  onToggleExpand={(id) => void toggleClientExpand(id)}
                  onOpenContact={openContact}
                  onOpenOrder={openOrder}
                  onComment={(row) =>
                    setCommentTarget({ contactId: row.contactId, clientName: row.clientName })
                  }
                  onCopyPay={(row) => void handleCopyPay(row)}
                />
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500">
                        {t.periodPaymentsFrom}
                      </label>
                      <input
                        type="date"
                        value={periodPaidFrom}
                        onChange={(e) => setPeriodPaidFrom(e.target.value)}
                        className="mt-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500">
                        {t.periodPaymentsTo}
                      </label>
                      <input
                        type="date"
                        value={periodPaidTo}
                        onChange={(e) => setPeriodPaidTo(e.target.value)}
                        className="mt-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void loadPeriodPayments()
                          .then((items) => setPeriodPayments(items))
                          .catch(() => setPeriodPayments([]));
                      }}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {t.periodPaymentsApply}
                    </button>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-900">{t.periodPaymentsTitle}</h3>
                  {periodPayments.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">{t.noPeriodPayments}</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-zinc-100 text-sm">
                      {periodPayments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span className="text-zinc-500">{formatDate(p.paidAt.slice(0, 10))}</span>
                          <span className="font-medium tabular-nums">
                            {p.amount.toFixed(2)} {p.currency}
                          </span>
                          <span className="text-zinc-600">{p.clientName ?? "—"}</span>
                          <span className="text-zinc-500">{p.orderNumber ?? "—"}</span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                            {p.sourceType}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <WorkOrdersTable
                rows={workOrders}
                onOpenOrder={openOrder}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={snapshotId}
                onChange={(e) => setSnapshotId(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              >
                {snapshots.length === 0 ? (
                  <option value="">{t.noSnapshots}</option>
                ) : (
                  snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.snapshotDate.slice(0, 10))} — {t.snapshotImportedBy}{" "}
                      {s.importedBy?.fullName ?? "—"}
                    </option>
                  ))
                )}
              </select>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={deltasOnly && !reconcileStatus}
                  onChange={(e) => {
                    setDeltasOnly(e.target.checked);
                    if (e.target.checked) setReconcileStatus("");
                  }}
                />
                {t.deltasOnly}
              </label>
              <select
                value={reconcileStatus}
                onChange={(e) => {
                  const next = e.target.value;
                  setReconcileStatus(next);
                  if (next) setDeltasOnly(false);
                }}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">{t.allStatuses}</option>
                {(Object.keys(RECONCILE_STATUS_LABELS) as ReceivablesReconcileStatus[]).map(
                  (st) => (
                    <option key={st} value={st}>
                      {RECONCILE_STATUS_LABELS[st]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={t.kpi1CTotal}
                value={formatMoney(reconcileSummary?.kpi.total1C ?? 0, currency)}
              />
              <KpiCard
                title={t.kpiCRMTotal}
                value={formatMoney(reconcileSummary?.kpi.totalCRM ?? 0, currency)}
              />
              <KpiCard
                title={t.kpiDelta}
                value={formatMoney(reconcileSummary?.kpi.totalDelta ?? 0, currency)}
                variant={reconcileSummary?.kpi.isAligned ? "ok" : "risk"}
              />
              <KpiCard
                title={t.kpiDeltaCount}
                value={String(reconcileSummary?.kpi.deltaCount ?? 0)}
                variant={reconcileSummary?.kpi.isAligned ? "ok" : "risk"}
              />
            </div>

            {showReconcileSpinner ? (
              <div className="text-sm text-zinc-500">{strings.common.loading}</div>
            ) : snapshots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
                {canUpload ? t.emptySnapshotsLead : t.emptySnapshotsManager}
              </div>
            ) : (
              <ReconcileTable
                rows={reconcileRows}
                currency={currency}
                onOpenContact={openContact}
                onSearchCode={(code) => {
                  setQInput(code);
                  setQ(code);
                }}
              />
            )}
          </div>
        )}
      </PageShell>

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">{t.uploadTitle}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t.uploadHint}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-zinc-600">{t.snapshotDate}</span>
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600">{t.uploadCurrency}</span>
                <select
                  value={uploadCurrency}
                  onChange={(e) => setUploadCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="USD">USD</option>
                  <option value="UAH">UAH</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600">{t.note}</span>
                <input
                  type="text"
                  value={uploadNote}
                  onChange={(e) => setUploadNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {uploading ? strings.common.loading : t.chooseFile}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="mt-3 w-full text-sm text-zinc-500 hover:text-zinc-700"
            >
              {strings.common.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {root ? (
        <EntityModalStackLayers
          frames={stack.frames}
          root={root}
          userRole={role}
          onOpen={stack.open}
          onCloseFrom={closeFrom}
          onReplace={stack.replace}
          onReplaceRoot={replaceRoot}
          onUpdate={() => void reload({ silent: true })}
        />
      ) : null}

      {commentTarget ? (
        <DebtCommentDialog
          contactId={commentTarget.contactId}
          clientName={commentTarget.clientName}
          onClose={() => setCommentTarget(null)}
          onSaved={() => {
            pushToast(t.commentSuccess, "success");
            void loadWork()
              .then(applyWorkResult)
              .catch(() => pushToast(t.loadError, "error"));
          }}
        />
      ) : null}
    </>
  );
}

const COMMENT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function isCommentStale(lastCommentAt: string | null): boolean {
  if (!lastCommentAt) return true;
  const ts = Date.parse(lastCommentAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > COMMENT_STALE_MS;
}

function ClientRowActions({
  row,
  onComment,
  onCopyPay,
}: {
  row: WorkClientRow;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
}) {
  const t = strings.receivables;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.phone ? <KyivstarDialButton phone={row.phone} size="sm" label="" /> : null}
      {row.primaryOrderId ? (
        <button
          type="button"
          onClick={() => onCopyPay(row)}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {t.copyPayLink}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onComment(row)}
        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {t.commentAdd}
      </button>
    </div>
  );
}

function WorkClientsTable({
  rows,
  currency,
  expandedClients,
  clientDetails,
  clientDetailsLoading,
  onToggleExpand,
  onOpenContact,
  onOpenOrder,
  onComment,
  onCopyPay,
}: {
  rows: WorkClientRow[];
  currency: string;
  expandedClients: Set<string>;
  clientDetails: Map<string, ContactReceivablesResponse>;
  clientDetailsLoading: Set<string>;
  onToggleExpand: (contactId: string) => void;
  onOpenContact: (id: string) => void;
  onOpenOrder: (id: string) => void;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
}) {
  const t = strings.receivables;
  if (rows.length === 0) {
    return <div className="text-sm text-zinc-500">{t.noClients}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-4 py-3 w-8" />
            <th className="px-4 py-3">{t.colClient}</th>
            <th className="px-4 py-3">{t.colCode1C}</th>
            <th className="px-4 py-3 text-right">{t.colDebt}</th>
            <th className="px-4 py-3 text-right">{t.colOverdue}</th>
            <th className="px-4 py-3 text-right">{t.colOverpayment}</th>
            <th className="px-4 py-3 text-right">{t.colOrders}</th>
            <th className="px-4 py-3">{t.colLastPayment}</th>
            <th className="px-4 py-3">{t.colManager}</th>
            <th className="px-4 py-3">{t.colLastComment}</th>
            <th className="px-4 py-3">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const stale = isCommentStale(row.lastCommentAt);
            const expanded = expandedClients.has(row.contactId);
            const detail = clientDetails.get(row.contactId);
            const loadingDetail = clientDetailsLoading.has(row.contactId);
            return (
              <Fragment key={row.contactId}>
                <tr className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onToggleExpand(row.contactId)}
                      className="text-zinc-500 hover:text-zinc-800"
                      aria-label={expanded ? t.collapseDetails : t.expandDetails}
                    >
                      {expanded ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                      onClick={() => onOpenContact(row.contactId)}
                    >
                      {row.clientName}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {row.externalCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatMoney(row.debtAmount, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">
                    {row.overdueAmount > 0 ? formatMoney(row.overdueAmount, currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {(row.overpaymentAmount ?? 0) > 0
                      ? formatMoney(row.overpaymentAmount!, currency)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.orderCount}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {row.lastPaymentAt ? formatDate(row.lastPaymentAt.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{row.ownerName ?? "—"}</td>
                  <td className="px-4 py-3 max-w-[16rem]">
                    {row.lastCommentAt ? (
                      <div className={stale ? "text-amber-800" : "text-zinc-700"}>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span>{formatDate(row.lastCommentAt.slice(0, 10))}</span>
                          {row.lastCommentAuthorName ? (
                            <span className="text-zinc-500">· {row.lastCommentAuthorName}</span>
                          ) : null}
                          {stale ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                              {t.commentStale}
                            </span>
                          ) : null}
                        </div>
                          {row.lastCommentPreview ? (
                          <div className="mt-0.5 truncate text-xs text-zinc-500">
                            {row.lastCommentPreview}
                          </div>
                        ) : null}
                        {row.promiseDate ? (
                          <div className="mt-0.5 text-xs text-amber-800">
                            {t.promiseDate}: {row.promiseDate}
                            {row.promiseAmount != null ? ` · ${row.promiseAmount.toFixed(2)}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-700">{t.commentNone}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ClientRowActions row={row} onComment={onComment} onCopyPay={onCopyPay} />
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-zinc-50/80">
                    <td colSpan={11} className="px-6 py-4">
                      {loadingDetail ? (
                        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
                      ) : detail ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-zinc-500">
                              {t.expandOrders}
                            </h4>
                            <ul className="mt-2 space-y-1 text-sm">
                              {detail.orders.map((o) => (
                                <li key={o.id} className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="font-medium text-zinc-800 underline-offset-2 hover:underline"
                                    onClick={() => onOpenOrder(o.id)}
                                  >
                                    {o.orderNumber}
                                  </button>
                                  <span className="tabular-nums">
                                    {formatOrderAmount(o.debtAmount, o.currency)}
                                  </span>
                                  {(o.creditAmount ?? 0) > 0 ? (
                                    <span className="text-emerald-700">
                                      +{formatOrderAmount(o.creditAmount!, o.currency)}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-zinc-500">
                              {t.expandPayments}
                            </h4>
                            <ul className="mt-2 space-y-1 text-sm">
                              {(detail.payments ?? []).length === 0 ? (
                                <li className="text-zinc-500">{t.noPeriodPayments}</li>
                              ) : (
                                detail.payments!.map((p) => (
                                  <li key={p.id} className="flex flex-wrap gap-2">
                                    <span className="text-zinc-500">
                                      {formatDate(p.paidAt.slice(0, 10))}
                                    </span>
                                    <span className="tabular-nums">
                                      {p.amount.toFixed(2)} {p.currency}
                                    </span>
                                    <span className="text-zinc-600">{p.orderNumber ?? "—"}</span>
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WorkOrdersTable({
  rows,
  onOpenOrder,
}: {
  rows: WorkOrderRow[];
  onOpenOrder: (id: string) => void;
}) {
  const t = strings.receivables;
  if (rows.length === 0) {
    return <div className="text-sm text-zinc-500">{t.noOrders}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-4 py-3">{t.colOrder}</th>
            <th className="px-4 py-3">{t.colClient}</th>
            <th className="px-4 py-3">{t.colCode1C}</th>
            <th className="px-4 py-3 text-right">{t.colDebt}</th>
            <th className="px-4 py-3">{t.colDue}</th>
            <th className="px-4 py-3">{t.colStatus}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer hover:bg-zinc-50"
              onClick={() => onOpenOrder(row.id)}
            >
              <td className="px-4 py-3 font-medium">{row.orderNumber}</td>
              <td className="px-4 py-3">{row.clientName ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.externalCode ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatOrderAmount(row.debtAmount, row.currency)}
              </td>
              <td className="px-4 py-3 text-zinc-600">
                {row.paymentDueDate ? formatDate(row.paymentDueDate.slice(0, 10)) : "—"}
              </td>
              <td className="px-4 py-3">
                {row.financialStatus ? (
                  <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {FINANCIAL_LABELS[row.financialStatus] ?? row.financialStatus}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconcileTable({
  rows,
  currency,
  onOpenContact,
  onSearchCode,
}: {
  rows: ReconciliationLine[];
  currency: string;
  onOpenContact: (id: string) => void;
  onSearchCode: (code: string) => void;
}) {
  const t = strings.receivables;
  if (rows.length === 0) {
    return <div className="text-sm text-zinc-500">{t.noReconcileRows}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-4 py-3">{t.colCode1C}</th>
            <th className="px-4 py-3">{t.colClient}</th>
            <th className="px-4 py-3 text-right">1С</th>
            <th className="px-4 py-3 text-right">CRM</th>
            <th className="px-4 py-3 text-right">Δ</th>
            <th className="px-4 py-3">{t.colStatus}</th>
            <th className="px-4 py-3">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-zinc-50">
              <td className="px-4 py-3 font-mono text-xs">{row.counterpartyCode1C}</td>
              <td className="px-4 py-3">{row.clientName ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.amount1C > 0 ? formatMoney(row.amount1C, currency) : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.amountCRM > 0 ? formatMoney(row.amountCRM, currency) : "—"}
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums font-medium ${
                  Math.abs(row.delta) > 0.01 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {formatMoney(row.delta, currency)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${RECONCILE_STATUS_CLASS[row.status]}`}
                >
                  {RECONCILE_STATUS_LABELS[row.status]}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {row.contactId ? (
                    <button
                      type="button"
                      onClick={() => onOpenContact(row.contactId!)}
                      className="text-xs font-medium text-zinc-700 underline"
                    >
                      {t.actionContact}
                    </button>
                  ) : null}
                  {row.status === "ONLY_1C" ? (
                    <button
                      type="button"
                      onClick={() => onSearchCode(row.counterpartyCode1C)}
                      className="text-xs font-medium text-blue-600 underline"
                    >
                      {t.searchByCode}
                    </button>
                  ) : null}
                  {row.status === "DELTA_1C_MORE" && row.contactId ? (
                    <button
                      type="button"
                      onClick={() => onOpenContact(row.contactId!)}
                      className="text-xs font-medium text-blue-600 underline"
                    >
                      {t.actionPayments}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
