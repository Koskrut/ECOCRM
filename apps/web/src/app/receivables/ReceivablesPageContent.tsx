"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Upload } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/feedback";
import { formatDate, shiftYmdInKyiv, todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import {
  buildReceivablesSearchParams,
  parseReceivablesFilters,
  type ReceivablesTab,
  type ReceivablesWorkView,
  type SortDir,
} from "./receivables-url";
import { isSnoozeActive, pickTodayCollectQueue } from "./debt-promise";
import type { AgingChip } from "./aging";
import { formatMoney } from "./format-money";
import { downloadCsv } from "./export-csv";
import { TodayCollectQueue } from "./TodayCollectQueue";
import { WorkClientsTable } from "./WorkClientsTable";
import { WorkOrdersTable } from "./WorkOrdersTable";
import { ReconcileTable } from "./ReconcileTable";
import { UploadSnapshotModal } from "./UploadSnapshotModal";
import { PeriodPaymentsPanel } from "./PeriodPaymentsPanel";
import { KpiCard } from "./KpiCard";
import { ReceivablesBatchToolbar } from "./ReceivablesBatchToolbar";
import { DebtReminderDialog } from "./DebtReminderDialog";
import { ReceivablesAgingWidget } from "./ReceivablesAgingWidget";
import { DebtCommentDialog } from "./DebtCommentDialog";
import { LinkReconcileContactDialog } from "./LinkReconcileContactDialog";
import {
  FilterChip,
  ReceivablesWorkFiltersPopover,
  activeWorkFilterChips,
  clearWorkFilter,
  pickWorkFilters,
  resetWorkFilters,
  type ReceivablesWorkFilters,
} from "./ReceivablesWorkFilters";
import { RECONCILE_STATUS_FILTERS, reconcileStatusLabel } from "./receivables-labels";
import { useReceivablesWork } from "./useReceivablesWork";
import { useReceivablesReconcile } from "./useReceivablesReconcile";
import { usePeriodPayments } from "./usePeriodPayments";
import { useClientReceivablesDetails } from "./useClientReceivablesDetails";
import {
  receivablesApi,
  type ReceivablesSnoozeDays,
  type ReconciliationLine,
  type WorkClientRow,
  type WorkClientsSortKey,
} from "@/lib/api/resources/receivables";
import { conversationsApi } from "@/lib/api/resources/conversations";
import { useEntityModalStack, type EntityModalFrame } from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";

type MeResponse = { user?: { role?: string; id?: string } };
type ManagerOption = { id: string; fullName: string };

const AGING_OPTIONS: Array<[AgingChip, string]> = [
  ["", strings.receivables.agingAll],
  ["0-7", strings.receivables.aging0to7],
  ["8-30", strings.receivables.aging8to30],
  ["31-60", strings.receivables.aging31to60],
  ["61-90", strings.receivables.aging61to90],
  ["90+", strings.receivables.aging90plus],
];

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

function SegmentButton({
  active,
  onClick,
  children,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "md" | "sm";
}) {
  const sizeClass = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md font-medium ${sizeClass} ${
        active ? "bg-zinc-800 text-white" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function ListPager({
  shown,
  total,
  loadingMore,
  hasMore,
  onLoadMore,
}: {
  shown: number;
  total: number;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const t = strings.receivables;
  if (total <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
      <span>{t.showingOf(shown, total)}</span>
      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {loadingMore ? t.updating : t.loadMore}
        </button>
      ) : null}
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

  const [tab, setTab] = useState<ReceivablesTab>(initialFilters.tab);
  const [workView, setWorkView] = useState<ReceivablesWorkView>(initialFilters.workView);
  const [workFilters, setWorkFilters] = useState<ReceivablesWorkFilters>(() =>
    pickWorkFilters(initialFilters),
  );
  const [aging, setAging] = useState<AgingChip>(initialFilters.aging);
  const [sort, setSort] = useState<WorkClientsSortKey | "">(initialFilters.sort);
  const [dir, setDir] = useState<SortDir>(initialFilters.dir);
  const [deltasOnly, setDeltasOnly] = useState(initialFilters.deltasOnly);
  const [reconcileStatus, setReconcileStatus] = useState(initialFilters.reconcileStatus);
  const [snapshotId, setSnapshotId] = useState(initialFilters.snapshotId);
  const [ownerId, setOwnerId] = useState(initialFilters.ownerId);
  const [q, setQ] = useState(initialFilters.q);
  const [qInput, setQInput] = useState(initialFilters.q);
  const [clientId, setClientId] = useState(initialFilters.clientId);
  const [clientFilterName, setClientFilterName] = useState("");
  const [periodPaidFrom, setPeriodPaidFrom] = useState(initialFilters.periodPaidFrom);
  const [periodPaidTo, setPeriodPaidTo] = useState(initialFilters.periodPaidTo);

  const [role, setRole] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{
    contactId: string;
    clientName: string;
  } | null>(null);
  const [remindTarget, setRemindTarget] = useState<WorkClientRow | null>(null);
  const [linkLine, setLinkLine] = useState<ReconciliationLine | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [snoozedPanelRows, setSnoozedPanelRows] = useState<WorkClientRow[]>([]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const work = useReceivablesWork({
    enabled: tab === "work",
    workView,
    ownerId,
    q,
    clientId,
    filters: workFilters,
    aging,
    sort,
    dir,
    onLoaded: clearSelection,
  });
  const periodPayments = usePeriodPayments({
    enabled: tab === "work" && workView === "clients",
    paidFrom: periodPaidFrom,
    paidTo: periodPaidTo,
    ownerId,
  });
  const reconcile = useReceivablesReconcile({
    enabled: tab === "reconcile",
    snapshotId,
    ownerId,
    q,
    deltasOnly,
    reconcileStatus,
  });
  const clientDetails = useClientReceivablesDetails();

  const { snapshots } = reconcile;
  const isLeadOrAdmin = role === "ADMIN" || role === "LEAD";
  const canUpload = isLeadOrAdmin;
  const canRefresh = isLeadOrAdmin;
  const currency = work.summary?.currency ?? reconcile.summary?.currency ?? "USD";
  const selectedSnapshot = snapshots.find((s) => s.id === snapshotId) ?? snapshots[0] ?? null;

  const urlState = useMemo(
    () => ({
      tab,
      workView,
      ...workFilters,
      deltasOnly,
      reconcileStatus,
      snapshotId,
      ownerId,
      q,
      clientId,
      contactId,
      orderId,
      aging,
      sort,
      dir,
      periodPaidFrom,
      periodPaidTo,
    }),
    [
      tab,
      workView,
      workFilters,
      deltasOnly,
      reconcileStatus,
      snapshotId,
      ownerId,
      q,
      clientId,
      contactId,
      orderId,
      aging,
      sort,
      dir,
      periodPaidFrom,
      periodPaidTo,
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

  useEffect(() => {
    if (!snapshotId && snapshots[0]) setSnapshotId(snapshots[0].id);
  }, [snapshotId, snapshots]);

  useEffect(() => {
    if (!clientId || clientFilterName) return;
    const fromOrders = work.orders.find((row) => row.clientId === clientId);
    if (fromOrders?.clientName) {
      setClientFilterName(fromOrders.clientName);
      return;
    }
    const fromClients = work.clients.find((row) => row.contactId === clientId);
    if (fromClients?.clientName) setClientFilterName(fromClients.clientName);
  }, [clientId, clientFilterName, work.orders, work.clients]);

  // Keep snoozed panel in sync with loaded clients; optionally enrich from API.
  useEffect(() => {
    const today = todayYmdInKyiv();
    setSnoozedPanelRows(work.clients.filter((r) => isSnoozeActive(r.snoozedUntil, today)));
  }, [work.clients]);

  useEffect(() => {
    if (tab !== "work" || workView !== "clients") return;
    if (work.snoozedCount <= 0) return;
    let cancelled = false;
    void receivablesApi
      .workClients({
        ownerId: ownerId || undefined,
        aging: aging || undefined,
        overdue: workFilters.overdue || undefined,
        q: q || undefined,
        snoozed: "only",
        page: 1,
        pageSize: 100,
      })
      .then((res) => {
        if (!cancelled) setSnoozedPanelRows(res.data.items ?? []);
      })
      .catch(() => {
        /* keep local filter */
      });
    return () => {
      cancelled = true;
    };
  }, [tab, workView, work.snoozedCount, ownerId, aging, workFilters.overdue, q]);

  const { reload: reloadWork } = work;
  const { reload: reloadPeriodPayments } = periodPayments;
  const { reload: reloadReconcile } = reconcile;
  const reloadActiveTab = useCallback(() => {
    if (tab === "work") {
      void reloadWork({ silent: true });
      if (workView === "clients") void reloadPeriodPayments();
    } else {
      void reloadReconcile({ silent: true });
    }
  }, [tab, workView, reloadWork, reloadPeriodPayments, reloadReconcile]);

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

  const todayQueue = useMemo(() => pickTodayCollectQueue(work.clients), [work.clients]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected =
        work.clients.length > 0 && work.clients.every((r) => prev.has(r.contactId));
      if (allSelected) return new Set();
      return new Set(work.clients.map((r) => r.contactId));
    });
  }, [work.clients]);

  const handleSort = useCallback((key: WorkClientsSortKey) => {
    setSort((prev) => {
      if (prev === key) {
        setDir((d) => (d === "desc" ? "asc" : "desc"));
        return key;
      }
      setDir("desc");
      return key;
    });
  }, []);

  const toggleWorkFilter = useCallback((key: keyof ReceivablesWorkFilters, value = true) => {
    setWorkFilters((prev) => {
      if (key === "delayReason") return prev;
      const current = prev[key];
      if (typeof current === "boolean") {
        return { ...prev, [key]: current ? false : value };
      }
      return prev;
    });
    setWorkView("clients");
    setTab("work");
  }, []);

  const sendTelegramReminder = useCallback(
    async (row: WorkClientRow, text: string) => {
      const conversationId = row.telegramConversationId;
      if (!conversationId) {
        return { ok: false, error: t.reminderTelegramMissing };
      }
      try {
        await conversationsApi.sendMessage(conversationId, text);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : t.reminderTelegramMissing,
        };
      }
    },
    [t.reminderTelegramMissing],
  );

  const handleSnooze = async (row: WorkClientRow, days: ReceivablesSnoozeDays) => {
    const until = shiftYmdInKyiv(todayYmdInKyiv(), days);
    const prev = row.snoozedUntil ?? null;
    const prevBy = row.snoozedByName ?? null;
    const wasActive = isSnoozeActive(prev);
    work.setClients((list) =>
      list.map((r) =>
        r.contactId === row.contactId
          ? { ...r, snoozedUntil: until, snoozedByName: r.snoozedByName ?? "…" }
          : r,
      ),
    );
    if (!wasActive) work.setSnoozedCount((n) => n + 1);
    try {
      const res = await receivablesApi.snooze(row.contactId, { days });
      const realUntil = res.data.snoozedUntil ?? until;
      work.setClients((list) =>
        list.map((r) =>
          r.contactId === row.contactId
            ? {
                ...r,
                snoozedUntil: realUntil,
                snoozedByName: res.data.snoozedByName ?? r.snoozedByName,
              }
            : r,
        ),
      );
      pushToast(t.snoozeSuccess(formatDate(realUntil)), "success");
    } catch {
      work.setClients((list) =>
        list.map((r) =>
          r.contactId === row.contactId ? { ...r, snoozedUntil: prev, snoozedByName: prevBy } : r,
        ),
      );
      if (!wasActive) work.setSnoozedCount((n) => Math.max(0, n - 1));
      pushToast(t.snoozeError, "error");
    }
  };

  const handleUnsnooze = async (row: WorkClientRow) => {
    const prev = row.snoozedUntil ?? null;
    const prevBy = row.snoozedByName ?? null;
    work.setClients((list) =>
      list.map((r) =>
        r.contactId === row.contactId ? { ...r, snoozedUntil: null, snoozedByName: null } : r,
      ),
    );
    setSnoozedPanelRows((list) => list.filter((r) => r.contactId !== row.contactId));
    work.setSnoozedCount((n) => Math.max(0, n - 1));
    try {
      await receivablesApi.unsnooze(row.contactId);
      pushToast(t.unsnoozeSuccess, "success");
    } catch {
      work.setClients((list) =>
        list.map((r) =>
          r.contactId === row.contactId ? { ...r, snoozedUntil: prev, snoozedByName: prevBy } : r,
        ),
      );
      work.setSnoozedCount((n) => n + 1);
      pushToast(t.unsnoozeError, "error");
    }
  };

  const handleBatchCallTasks = async () => {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await receivablesApi.batch({
        contactIds: [...selectedIds],
        action: "create_call_tasks",
      });
      pushToast(t.batchTasksCreated(res.data.processed), "success");
      clearSelection();
    } catch {
      pushToast(t.loadError, "error");
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchAssign = async (nextOwnerId: string) => {
    if (selectedIds.size === 0 || !nextOwnerId) return;
    setBatchBusy(true);
    try {
      const res = await receivablesApi.batch({
        contactIds: [...selectedIds],
        action: "assign_owner",
        ownerId: nextOwnerId,
      });
      pushToast(t.batchAssigned(res.data.processed), "success");
      await work.reload({ silent: true });
    } catch {
      pushToast(t.loadError, "error");
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchSnooze = async (days: ReceivablesSnoozeDays) => {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    const until = shiftYmdInKyiv(todayYmdInKyiv(), days);
    const ids = [...selectedIds];
    work.setClients((list) =>
      list.map((r) => (ids.includes(r.contactId) ? { ...r, snoozedUntil: until } : r)),
    );
    try {
      const res = await receivablesApi.batch({
        contactIds: ids,
        action: "snooze",
        days,
      });
      pushToast(t.snoozeSuccess(formatDate(res.data.snoozedUntil ?? until)), "success");
      clearSelection();
      await work.reload({ silent: true });
    } catch {
      pushToast(t.snoozeError, "error");
      await work.reload({ silent: true });
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchRemind = () => {
    const first = work.clients.find((r) => selectedIds.has(r.contactId));
    if (first) setRemindTarget(first);
  };

  const handleRefreshReconcile = async () => {
    if (!snapshotId || !canRefresh) return;
    setRefreshing(true);
    try {
      await receivablesApi.refreshReconciliation(snapshotId);
      await reconcile.reload({ silent: true });
      pushToast(t.refreshSuccess, "success");
    } catch {
      pushToast(t.refreshError, "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleUploaded = async (snapshot: { id: string }) => {
    setUploadOpen(false);
    await reconcile.reloadSnapshots();
    setTab("reconcile");
    setSnapshotId(snapshot.id);
  };

  const clearClientFilter = () => {
    setClientId("");
    setClientFilterName("");
  };

  const exportClients = () => {
    downloadCsv(
      "receivables-clients.csv",
      [
        "client",
        "code1C",
        "debt",
        "overdue",
        "overdueDays",
        "orders",
        "lastPayment",
        "manager",
        "lastComment",
        "snoozedUntil",
      ],
      work.clients.map((r) => [
        r.clientName,
        r.externalCode,
        r.debtAmount,
        r.overdueAmount,
        r.overdueDays ?? "",
        r.orderCount,
        r.lastPaymentAt?.slice(0, 10) ?? "",
        r.ownerName,
        r.lastCommentPreview,
        r.snoozedUntil ?? "",
      ]),
    );
  };

  const exportOrders = () => {
    downloadCsv(
      "receivables-orders.csv",
      ["order", "client", "code1C", "debt", "currency", "due", "status", "manager"],
      work.orders.map((r) => [
        r.orderNumber,
        r.clientName,
        r.externalCode,
        r.debtAmount,
        r.currency,
        r.paymentDueDate?.slice(0, 10) ?? "",
        r.financialStatus,
        r.ownerName,
      ]),
    );
  };

  const exportReconcile = () => {
    downloadCsv(
      "receivables-reconcile.csv",
      ["code1C", "client", "amount1C", "amountCRM", "delta", "status", "manager"],
      reconcile.rows.map((r) => [
        r.counterpartyCode1C,
        r.clientName,
        r.amount1C,
        r.amountCRM,
        r.delta,
        r.status,
        r.ownerName,
      ]),
    );
  };

  const reconciliationBanner = useMemo(() => {
    const rec = work.summary?.reconciliation;
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
        <button
          type="button"
          onClick={() => {
            setTab("work");
            setWorkView("clients");
            setWorkFilters((prev) => ({ ...prev, reconcileDeltaOnly: true }));
          }}
          className="font-medium underline underline-offset-2"
        >
          {t.filterShowDeltas}
        </button>
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
  }, [work.summary, canUpload, t]);

  const workFilterChips = activeWorkFilterChips(workFilters, workView);
  const workHasRows = workView === "orders" ? work.orders.length > 0 : work.clients.length > 0;
  const reconcileHasRows = reconcile.rows.length > 0;
  const activeLoading = tab === "work" ? work.loading : reconcile.loading;
  const activeHasRows = tab === "work" ? workHasRows : reconcileHasRows;
  const showWorkSpinner = work.loading && !workHasRows;
  const showReconcileSpinner = !reconcile.snapshotsLoaded && snapshots.length === 0;
  const kpi = work.summary?.kpi;

  return (
    <>
      <PageShell
        title={t.pageTitle}
        subtitle={t.pageSubtitle}
        helpRouteKey="receivables"
        width="full"
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
              {canRefresh ? (
                <button
                  type="button"
                  disabled={refreshing || !selectedSnapshot}
                  onClick={() => void handleRefreshReconcile()}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  {t.refresh}
                </button>
              ) : null}
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

          {isLeadOrAdmin && managers.length > 0 ? (
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
          {activeLoading && activeHasRows ? (
            <span className="text-xs text-zinc-400">{t.updating}</span>
          ) : null}
        </div>

        {tab === "work" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <KpiCard
                title={t.kpiDebtOperational}
                value={formatMoney(kpi?.debtTotal ?? 0, currency)}
                variant="risk"
              />
              <KpiCard
                title={t.kpiOverdue}
                value={formatMoney(kpi?.overdueDebt ?? 0, currency)}
                variant="risk"
                active={workFilters.overdue}
                onClick={() => toggleWorkFilter("overdue")}
              />
              <KpiCard title={t.kpiClients} value={String(kpi?.clientsWithDebtCount ?? 0)} />
              <KpiCard title={t.kpiOrders} value={String(kpi?.ordersWithDebtCount ?? 0)} />
              <KpiCard
                title={t.kpiBitrixLegacy}
                value={formatMoney(kpi?.bitrixLegacyDebt ?? 0, currency)}
                subtitle={t.kpiBitrixLegacyHint}
              />
              <KpiCard
                title={t.kpiPromisedToday}
                value={formatMoney(kpi?.promisedTodayAmount ?? 0, currency)}
                subtitle={String(kpi?.promisedTodayCount ?? 0)}
                active={workFilters.promisedToday}
                onClick={() => toggleWorkFilter("promisedToday")}
              />
              <KpiCard
                title={t.kpiCollectedToday}
                value={formatMoney(kpi?.collectedTodayAmount ?? 0, currency)}
                variant="ok"
              />
            </div>

            {workView === "clients" ? (
              <TodayCollectQueue
                items={todayQueue.items}
                overdueTotal={todayQueue.overdueTotal}
                overdueCovered={todayQueue.overdueCovered}
                currency={currency}
                snoozedCount={work.snoozedCount}
                snoozedItems={snoozedPanelRows}
                onOpenContact={openContact}
                onComment={(next) =>
                  setCommentTarget({
                    contactId: next.contactId,
                    clientName: next.clientName,
                  })
                }
                onCopyPay={(next) => void handleCopyPay(next)}
                onRemind={(next) => setRemindTarget(next)}
                onSnooze={(row, days) => void handleSnooze(row, days)}
                onUnsnooze={(row) => void handleUnsnooze(row)}
              />
            ) : null}

            {workView === "clients" ? (
              <ReceivablesAgingWidget
                buckets={work.agingBuckets}
                currency={currency}
                activeAging={aging}
                onSelectAging={setAging}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
                <SegmentButton
                  active={workView === "clients"}
                  onClick={() => {
                    setWorkView("clients");
                    clearClientFilter();
                  }}
                >
                  {t.viewClients}
                </SegmentButton>
                <SegmentButton active={workView === "orders"} onClick={() => setWorkView("orders")}>
                  {t.viewOrders}
                </SegmentButton>
              </div>
              <ReceivablesWorkFiltersPopover
                value={workFilters}
                workView={workView}
                onApply={setWorkFilters}
              />
              {workView === "clients" ? (
                <div className="flex flex-wrap rounded-lg border border-zinc-200 bg-white p-0.5">
                  {AGING_OPTIONS.map(([value, label]) => (
                    <SegmentButton
                      key={value || "all"}
                      size="sm"
                      active={aging === value}
                      onClick={() => setAging(value)}
                    >
                      {label}
                    </SegmentButton>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={workView === "clients" ? exportClients : exportOrders}
                disabled={!workHasRows}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {t.exportCsv}
              </button>
              {workFilterChips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  label={chip.label}
                  onClear={() => setWorkFilters((prev) => clearWorkFilter(prev, chip.key))}
                />
              ))}
              {workView === "orders" && clientId ? (
                <FilterChip
                  label={`${t.filterByClient}${clientFilterName ? `: ${clientFilterName}` : ""}`}
                  onClear={clearClientFilter}
                />
              ) : null}
              {workFilterChips.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setWorkFilters((prev) => resetWorkFilters(prev, workView))}
                  className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
                >
                  {t.filtersClearAll}
                </button>
              ) : null}
            </div>

            {showWorkSpinner ? (
              <div className="text-sm text-zinc-500">{strings.common.loading}</div>
            ) : workView === "clients" ? (
              <>
                <WorkClientsTable
                  rows={work.clients}
                  currency={currency}
                  showManager={Boolean(role) && role !== "MANAGER"}
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                  expandedClients={clientDetails.expanded}
                  clientDetails={clientDetails.details}
                  clientDetailsLoading={clientDetails.loadingIds}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  onToggleExpand={(id) => void clientDetails.toggle(id)}
                  onOpenContact={openContact}
                  onOpenOrder={openOrder}
                  onComment={(row) =>
                    setCommentTarget({ contactId: row.contactId, clientName: row.clientName })
                  }
                  onCopyPay={(row) => void handleCopyPay(row)}
                  onRemind={(row) => setRemindTarget(row)}
                />
                <ListPager
                  shown={work.clients.length}
                  total={work.total}
                  loadingMore={work.loadingMore}
                  hasMore={work.hasMore}
                  onLoadMore={() => void work.loadMore()}
                />
                <ReceivablesBatchToolbar
                  selectedCount={selectedIds.size}
                  canAssignManager={isLeadOrAdmin}
                  managers={managers}
                  busy={batchBusy}
                  onClear={clearSelection}
                  onRemind={handleBatchRemind}
                  onCreateCallTasks={() => void handleBatchCallTasks()}
                  onAssignManager={(id) => void handleBatchAssign(id)}
                  onSnooze={(days) => void handleBatchSnooze(days)}
                />
                <PeriodPaymentsPanel
                  paidFrom={periodPaidFrom}
                  paidTo={periodPaidTo}
                  items={periodPayments.items}
                  total={periodPayments.total}
                  currency={periodPayments.currency || currency}
                  loadedTotalBase={periodPayments.loadedTotalBase}
                  loadingMore={periodPayments.loadingMore}
                  hasMore={periodPayments.hasMore}
                  onChangePaidFrom={setPeriodPaidFrom}
                  onChangePaidTo={setPeriodPaidTo}
                  onLoadMore={() => void periodPayments.loadMore()}
                />
              </>
            ) : (
              <>
                <WorkOrdersTable rows={work.orders} onOpenOrder={openOrder} />
                <ListPager
                  shown={work.orders.length}
                  total={work.total}
                  loadingMore={work.loadingMore}
                  hasMore={work.hasMore}
                  onLoadMore={() => void work.loadMore()}
                />
              </>
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
                {RECONCILE_STATUS_FILTERS.map((st) => (
                  <option key={st} value={st}>
                    {reconcileStatusLabel(st)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportReconcile}
                disabled={!reconcileHasRows}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {t.exportCsv}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={t.kpi1CTotal}
                value={formatMoney(reconcile.summary?.kpi.total1C ?? 0, currency)}
              />
              <KpiCard
                title={t.kpiCRMTotal}
                value={formatMoney(reconcile.summary?.kpi.totalCRM ?? 0, currency)}
              />
              <KpiCard
                title={t.kpiDelta}
                value={formatMoney(reconcile.summary?.kpi.totalDelta ?? 0, currency)}
                variant={reconcile.summary?.kpi.isAligned ? "ok" : "risk"}
              />
              <KpiCard
                title={t.kpiDeltaCount}
                value={String(reconcile.summary?.kpi.deltaCount ?? 0)}
                variant={reconcile.summary?.kpi.isAligned ? "ok" : "risk"}
              />
            </div>

            {showReconcileSpinner ? (
              <div className="text-sm text-zinc-500">{strings.common.loading}</div>
            ) : snapshots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
                {canUpload ? t.emptySnapshotsLead : t.emptySnapshotsManager}
              </div>
            ) : (
              <>
                <ReconcileTable
                  rows={reconcile.rows}
                  currency={currency}
                  canLinkContact={isLeadOrAdmin}
                  onOpenContact={openContact}
                  onSearchCode={(code) => {
                    setQInput(code);
                    setQ(code);
                  }}
                  onLinkContact={(row) => setLinkLine(row)}
                />
                <ListPager
                  shown={reconcile.rows.length}
                  total={reconcile.total}
                  loadingMore={reconcile.loadingMore}
                  hasMore={reconcile.hasMore}
                  onLoadMore={() => void reconcile.loadMore()}
                />
              </>
            )}
          </div>
        )}
      </PageShell>

      {uploadOpen ? (
        <UploadSnapshotModal onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
      ) : null}

      {linkLine ? (
        <LinkReconcileContactDialog
          lineId={linkLine.id}
          code1C={linkLine.counterpartyCode1C}
          onClose={() => setLinkLine(null)}
          onLinked={() => {
            pushToast(t.linkContactSuccess, "success");
            void reconcile.reload({ silent: true });
          }}
        />
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
          onUpdate={reloadActiveTab}
        />
      ) : null}

      {commentTarget ? (
        <DebtCommentDialog
          contactId={commentTarget.contactId}
          clientName={commentTarget.clientName}
          onClose={() => setCommentTarget(null)}
          onSaved={() => {
            pushToast(t.commentSuccess, "success");
            void work.reload({ silent: true });
          }}
        />
      ) : null}
      {remindTarget ? (
        <DebtReminderDialog
          row={remindTarget}
          currency={currency}
          onClose={() => setRemindTarget(null)}
          onSendTelegram={async (text) => {
            if (selectedIds.size > 1 && selectedIds.has(remindTarget.contactId)) {
              try {
                const res = await receivablesApi.batch({
                  contactIds: [...selectedIds],
                  action: "send_telegram",
                  message: text,
                });
                pushToast(
                  t.batchTelegramResult(res.data.processed, res.data.skipped),
                  res.data.processed > 0 ? "success" : "info",
                );
                return { ok: res.data.processed > 0, error: t.reminderTelegramMissing };
              } catch (e) {
                return {
                  ok: false,
                  error: e instanceof Error ? e.message : t.reminderTelegramMissing,
                };
              }
            }
            return sendTelegramReminder(remindTarget, text);
          }}
        />
      ) : null}
    </>
  );
}
