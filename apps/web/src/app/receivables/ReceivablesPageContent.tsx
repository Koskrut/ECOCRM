"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatDate } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";
import {
  receivablesApi,
  type ReceivablesReconcileStatus,
  type ReceivablesSnapshot,
  type ReconciliationLine,
  type WorkClientRow,
  type WorkOrderRow,
} from "@/lib/api/resources/receivables";
import { DebtCommentDialog } from "./DebtCommentDialog";
import { useEntityModalStack, type EntityModalFrame } from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";

type Tab = "work" | "reconcile";
type WorkView = "clients" | "orders";

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

  const tab: Tab = searchParams.get("tab") === "reconcile" ? "reconcile" : "work";
  const workView: WorkView = searchParams.get("view") === "orders" ? "orders" : "clients";
  const overdue = searchParams.get("overdue") === "true";
  const needsComment = searchParams.get("needsComment") === "true";
  const deltasOnly = searchParams.get("deltasOnly") === "true";
  const reconcileStatus = searchParams.get("status") ?? "";
  const snapshotId = searchParams.get("snapshotId") ?? "";
  const ownerId = searchParams.get("ownerId") ?? "";
  const q = searchParams.get("q") ?? "";
  const contactId = searchParams.get("contactId") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  const root = useMemo<EntityModalFrame | null>(() => {
    if (contactId) return { type: "contact", id: contactId };
    if (orderId) return { type: "order", id: orderId };
    return null;
  }, [contactId, orderId]);
  const stack = useEntityModalStack(root);

  const [role, setRole] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [searchInput, setSearchInput] = useState(q);
  const [snapshots, setSnapshots] = useState<ReceivablesSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState(snapshotId);
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
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadNote, setUploadNote] = useState("");
  const [uploadCurrency, setUploadCurrency] = useState("USD");
  const [uploading, setUploading] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{
    contactId: string;
    clientName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = role === "ADMIN" || role === "LEAD";
  const currency = workSummary?.currency ?? reconcileSummary?.currency ?? "USD";

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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
    const currentId = snapshotId || activeSnapshotId;
    if (!currentId && items[0]) {
      setActiveSnapshotId(items[0].id);
      if (tab === "reconcile") {
        patchParams({ snapshotId: items[0].id });
      }
    }
    return items;
  }, [snapshotId, activeSnapshotId, patchParams, tab]);

  const loadWork = useCallback(async () => {
    const [summaryRes, listRes] = await Promise.all([
      receivablesApi.workSummary(ownerId || undefined),
      workView === "orders"
        ? receivablesApi.workOrders({
            ownerId: ownerId || undefined,
            q: q || undefined,
            overdue,
            page: 1,
            pageSize: 100,
          })
        : receivablesApi.workClients({
            ownerId: ownerId || undefined,
            q: q || undefined,
            overdue,
            needsComment,
            page: 1,
            pageSize: 100,
          }),
    ]);
    setWorkSummary(summaryRes.data);
    if (workView === "orders") {
      setWorkOrders((listRes.data as { items: WorkOrderRow[] }).items ?? []);
      setWorkClients([]);
    } else {
      setWorkClients((listRes.data as { items: WorkClientRow[] }).items ?? []);
      setWorkOrders([]);
    }
  }, [ownerId, q, overdue, needsComment, workView]);

  const loadReconcile = useCallback(async () => {
    const sid = snapshotId || activeSnapshotId;
    if (!sid) {
      setReconcileSummary(null);
      setReconcileRows([]);
      return;
    }
    const [summaryRes, listRes] = await Promise.all([
      receivablesApi.reconciliationSummary(sid, ownerId || undefined),
      receivablesApi.listReconciliation({
        snapshotId: sid,
        ownerId: ownerId || undefined,
        q: q || undefined,
        deltasOnly,
        status: reconcileStatus || undefined,
        page: 1,
        pageSize: 200,
      }),
    ]);
    setReconcileSummary(summaryRes.data);
    setReconcileRows(listRes.data.items ?? []);
  }, [snapshotId, activeSnapshotId, ownerId, q, deltasOnly, reconcileStatus]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await loadSnapshots();
      if (tab === "work") await loadWork();
      else await loadReconcile();
    } catch (e) {
      pushToast(t.loadError, "error");
    } finally {
      setLoading(false);
    }
  }, [loadSnapshots, loadWork, loadReconcile, tab, pushToast, t.loadError]);

  const openContact = (id: string) => {
    if (root) {
      stack.open({ type: "contact", id });
      return;
    }
    stack.closeAll();
    patchParams({ contactId: id, orderId: null });
  };

  const openOrder = (id: string) => {
    if (root) {
      stack.open({ type: "order", id });
      return;
    }
    stack.closeAll();
    patchParams({ orderId: id, contactId: null });
  };

  const closeFrom = (index: number) => {
    if (index <= 0) {
      stack.closeAll();
      if (root?.type === "order") patchParams({ orderId: null });
      else patchParams({ contactId: null });
      return;
    }
    stack.closeFrom(index);
  };

  const replaceRoot = (frame: EntityModalFrame) => {
    if (frame.type === "contact") patchParams({ contactId: frame.id });
    else if (frame.type === "order") patchParams({ orderId: frame.id });
  };

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (snapshotId) setActiveSnapshotId(snapshotId);
  }, [snapshotId]);

  const handleRefreshReconcile = async () => {
    const sid = snapshotId || activeSnapshotId;
    if (!sid) return;
    setRefreshing(true);
    try {
      await receivablesApi.refreshReconciliation(sid);
      await loadReconcile();
      await loadWork();
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
      patchParams({ tab: "reconcile", snapshotId: res.data.id });
      await reload();
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
            onClick={() => patchParams({ tab: "reconcile", snapshotId: rec.snapshotId })}
            className="font-medium underline underline-offset-2"
          >
            {t.openReconcile}
          </button>
        ) : null}
      </div>
    );
  }, [workSummary, canUpload, patchParams, t]);

  const selectedSnapshot = snapshots.find((s) => s.id === (snapshotId || activeSnapshotId));

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
              onClick={() => patchParams({ tab: "work" })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "work" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {t.tabWork}
            </button>
            <button
              type="button"
              onClick={() =>
                patchParams({
                  tab: "reconcile",
                  snapshotId: selectedSnapshot?.id ?? snapshots[0]?.id ?? null,
                })
              }
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
              onChange={(e) => patchParams({ ownerId: e.target.value || null })}
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") patchParams({ q: searchInput.trim() || null });
            }}
            placeholder={t.searchPlaceholder}
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm sm:max-w-xs"
          />
        </div>

        {tab === "work" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => patchParams({ view: "clients" })}
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
                  onClick={() => patchParams({ view: "orders" })}
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
                  onChange={(e) => patchParams({ overdue: e.target.checked ? "true" : null })}
                />
                {t.overdueOnly}
              </label>
              {workView === "clients" ? (
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  <input
                    type="checkbox"
                    checked={needsComment}
                    onChange={(e) =>
                      patchParams({ needsComment: e.target.checked ? "true" : null })
                    }
                  />
                  {t.needsCommentOnly}
                </label>
              ) : null}
            </div>

            {loading ? (
              <div className="text-sm text-zinc-500">{strings.common.loading}</div>
            ) : workView === "clients" ? (
              <WorkClientsTable
                rows={workClients}
                currency={currency}
                onOpenContact={openContact}
                onComment={(row) =>
                  setCommentTarget({ contactId: row.contactId, clientName: row.clientName })
                }
              />
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
                value={snapshotId || activeSnapshotId}
                onChange={(e) => patchParams({ snapshotId: e.target.value })}
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
                  checked={deltasOnly}
                  onChange={(e) => patchParams({ deltasOnly: e.target.checked ? "true" : null })}
                />
                {t.deltasOnly}
              </label>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { value: "", label: t.allStatuses },
                    { value: "ONLY_1C", label: RECONCILE_STATUS_LABELS.ONLY_1C },
                    { value: "ONLY_CRM", label: RECONCILE_STATUS_LABELS.ONLY_CRM },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    onClick={() =>
                      patchParams({
                        status: opt.value || null,
                        deltasOnly: opt.value ? null : deltasOnly ? "true" : null,
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      reconcileStatus === opt.value
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <select
                value={reconcileStatus}
                onChange={(e) => patchParams({ status: e.target.value || null })}
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

            {loading ? (
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
                onOpenOrders={(id) => {
                  stack.closeAll();
                  patchParams({
                    tab: "work",
                    view: "orders",
                    contactId: id,
                    snapshotId: null,
                    orderId: null,
                  });
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
          onUpdate={() => void reload()}
        />
      ) : null}

      {commentTarget ? (
        <DebtCommentDialog
          contactId={commentTarget.contactId}
          clientName={commentTarget.clientName}
          onClose={() => setCommentTarget(null)}
          onSaved={() => {
            pushToast(t.commentSuccess, "success");
            void loadWork();
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

function WorkClientsTable({
  rows,
  currency,
  onOpenContact,
  onComment,
}: {
  rows: WorkClientRow[];
  currency: string;
  onOpenContact: (id: string) => void;
  onComment: (row: WorkClientRow) => void;
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
            <th className="px-4 py-3">{t.colClient}</th>
            <th className="px-4 py-3">{t.colCode1C}</th>
            <th className="px-4 py-3 text-right">{t.colDebt}</th>
            <th className="px-4 py-3 text-right">{t.colOverdue}</th>
            <th className="px-4 py-3 text-right">{t.colOrders}</th>
            <th className="px-4 py-3">{t.colManager}</th>
            <th className="px-4 py-3">{t.colLastComment}</th>
            <th className="px-4 py-3">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const stale = isCommentStale(row.lastCommentAt);
            return (
              <tr key={row.contactId} className="hover:bg-zinc-50">
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
                <td className="px-4 py-3 text-right tabular-nums">{row.orderCount}</td>
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
                    </div>
                  ) : (
                    <span className="text-xs text-amber-700">{t.commentNone}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onComment(row)}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {t.commentAdd}
                  </button>
                </td>
              </tr>
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
  onOpenOrders,
}: {
  rows: ReconciliationLine[];
  currency: string;
  onOpenContact: (id: string) => void;
  onOpenOrders: (contactId: string) => void;
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
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenContact(row.contactId!)}
                        className="text-xs font-medium text-zinc-700 underline"
                      >
                        {t.actionContact}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenOrders(row.contactId!)}
                        className="text-xs font-medium text-zinc-700 underline"
                      >
                        {t.actionOrders}
                      </button>
                    </>
                  ) : null}
                  {row.status === "ONLY_1C" ? (
                    <Link
                      href={`/contacts?q=${encodeURIComponent(`/${row.counterpartyCode1C}`)}`}
                      className="text-xs font-medium text-blue-600 underline"
                    >
                      {t.actionLinkCode}
                    </Link>
                  ) : null}
                  {row.status === "DELTA_1C_MORE" ? (
                    <Link href="/payments" className="text-xs font-medium text-blue-600 underline">
                      {t.actionPayments}
                    </Link>
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
