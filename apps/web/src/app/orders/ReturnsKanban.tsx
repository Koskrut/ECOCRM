"use client";

import { useCallback, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { isTextSelected } from "@/lib/dom";
import { formatDate } from "@/lib/crmDatetime";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { returnReasonLabel, returnStatusLabel, type ReturnStatusCode } from "@/lib/returns/return-labels";
import {
  getAllowedReturnStatusTransitions,
  isWarehouseReturnTransitionAllowed,
  WAREHOUSE_FORBIDDEN_RETURN_STATUSES,
  WAREHOUSE_RETURN_COLUMNS,
} from "@/lib/returns/return-transitions";
import {
  KanbanLoadSentinel,
  KANBAN_COLUMN_BODY_CLASS,
} from "@/components/kanban/KanbanLoadSentinel";
import {
  KANBAN_PAGE_SIZE,
  useKanbanInfiniteColumns,
} from "@/components/kanban/useKanbanInfiniteColumns";
import { strings } from "@/locales";
import { OrderReturnSettlementDialog } from "./OrderClientBalancePanel";

const tr = strings.kanban;
const planningStages = strings.planning.orderStages;

type ReturnStatus = ReturnStatusCode;

type ReturnOrder = {
  id: string;
  orderNumber: string;
  orderStage?: string | null;
  totalAmount?: number;
  debtAmount?: number;
  paidAmount?: number;
  currency?: string;
  exchangeRate?: number | null;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
};

type ReturnItem = {
  id: string;
  orderItemId: string;
  qtyReturned: number;
  orderItem?: { id: string; qty: number; price: number; lineTotal: number; productNameSnapshot?: string | null };
};

type ReturnCard = {
  id: string;
  orderId?: string;
  status: ReturnStatus;
  reason?: string;
  externalCode?: string | null;
  requestedAt: string;
  closedAt?: string | null;
  createdAt: string;
  itemsPending?: boolean;
  inboundDoneAt?: string | null;
  outboundDoneAt?: string | null;
  inboundWaivedAt?: string | null;
  outboundWaivedAt?: string | null;
  order: ReturnOrder & { id?: string };
  items: ReturnItem[];
  returnPackage?: {
    id: string;
    ttnNumber: string;
    status: string;
    ttnStatusCode?: string | null;
    ttnStatusText?: string | null;
  } | null;
};

type ReturnsListResponse = {
  items: ReturnCard[];
  total?: number;
  page?: number;
  pageSize?: number;
};

const ALL_COLUMN_ORDER: ReturnStatus[] = [
  "REQUESTED",
  "APPROVED",
  "IN_TRANSIT_BACK",
  "RECEIVED_BY_WAREHOUSE",
  "INSPECTION",
  "REFUND_OR_ADJUSTMENT",
  "CLOSED",
];

function orderStageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  const label = planningStages[stage as keyof typeof planningStages];
  return label ?? stage;
}

export function ReturnsKanban({
  onOpenOrder,
  onOpenReturn,
  refreshKey = 0,
  onRegisterIncoming,
  warehouseMode = false,
}: {
  onOpenOrder: (orderId: string) => void;
  onOpenReturn?: (returnId: string) => void;
  /** Increment to force refetch (e.g. after creating a return from order modal). */
  refreshKey?: number;
  onRegisterIncoming?: () => void;
  /** Warehouse staff: limited columns and transitions. */
  warehouseMode?: boolean;
}) {
  const [dragging, setDragging] = useState<{ returnId: string; from: ReturnStatus } | null>(null);
  const [dragOver, setDragOver] = useState<ReturnStatus | null>(null);
  const [pendingSettlement, setPendingSettlement] = useState<{
    returnId: string;
    from: ReturnStatus;
    to: ReturnStatus;
    currency: string;
  } | null>(null);

  const columnOrder = warehouseMode ? WAREHOUSE_RETURN_COLUMNS : ALL_COLUMN_ORDER;

  const kanbanResetKey = useMemo(
    () => JSON.stringify({ refreshKey, warehouseMode }),
    [refreshKey, warehouseMode],
  );

  const buildParams = useCallback(
    (status: ReturnStatus, page: number): Record<string, string> => ({
      status,
      page: String(page),
      pageSize: String(KANBAN_PAGE_SIZE),
    }),
    [],
  );

  const fetchPage = useCallback(async (params: Record<string, string>) => {
    const res = await apiHttp.get<ReturnsListResponse>("/order-returns", { params });
    const data = res.data ?? { items: [] };
    return {
      items: data.items ?? [],
      total: data.total ?? data.items?.length ?? 0,
    };
  }, []);

  const {
    columns: columnStates,
    loadMore,
    moveItem,
    reloadColumn,
    anyInitialLoading,
    firstError,
  } = useKanbanInfiniteColumns<ReturnCard, ReturnStatus>({
    columnIds: columnOrder,
    buildParams,
    fetchPage,
    resetKey: kanbanResetKey,
  });

  const columns = useMemo(
    () =>
      columnOrder.map((id) => ({
        id,
        title: returnStatusLabel(id),
        items: columnStates[id]?.items ?? [],
        state: columnStates[id],
      })),
    [columnOrder, columnStates],
  );

  const findReturn = useCallback(
    (returnId: string): ReturnCard | undefined => {
      for (const col of Object.values(columnStates)) {
        const found = col.items.find((x) => x.id === returnId);
        if (found) return found;
      }
      return undefined;
    },
    [columnStates],
  );

  const isDropAllowed = useCallback(
    (ret: ReturnCard, from: ReturnStatus, to: ReturnStatus): boolean => {
      if (warehouseMode) {
        if (WAREHOUSE_FORBIDDEN_RETURN_STATUSES.includes(to)) return false;
        return isWarehouseReturnTransitionAllowed(from, to);
      }
      return getAllowedReturnStatusTransitions(from, ret).includes(to);
    },
    [warehouseMode],
  );

  const patchStatus = useCallback(
    async (
      returnId: string,
      status: ReturnStatus,
      settlement?: {
        type: "CREDIT" | "REFUND" | "SPLIT";
        creditAmount?: number;
        refundAmount?: number;
      },
    ) => {
      await apiHttp.patch(`/order-returns/${returnId}/status`, { status, settlement });
    },
    [],
  );

  const applyStatusChange = useCallback(
    async (
      returnId: string,
      from: ReturnStatus,
      to: ReturnStatus,
      settlement?: {
        type: "CREDIT" | "REFUND" | "SPLIT";
        creditAmount?: number;
        refundAmount?: number;
      },
    ) => {
      moveItem(returnId, from, to, (r) => ({ ...r, status: to }));
      try {
        await patchStatus(returnId, to, settlement);
      } catch (e) {
        alert(e instanceof Error ? e.message : tr.statusUpdateFailed);
        reloadColumn(from);
        reloadColumn(to);
      }
    },
    [moveItem, patchStatus, reloadColumn],
  );

  const handleDrop = useCallback(
    async (returnId: string, to: ReturnStatus) => {
      const from = dragging?.from;
      if (!from || from === to) {
        setDragging(null);
        return;
      }

      const ret = findReturn(returnId);
      if (!ret) {
        setDragging(null);
        return;
      }

      if (!isDropAllowed(ret, from, to)) {
        alert(tr.returnsInvalidTransition(returnStatusLabel(from), returnStatusLabel(to)));
        setDragging(null);
        return;
      }

      if (to === "CLOSED") {
        if (ret.itemsPending || ret.items.length === 0) {
          alert(tr.returnsCloseBlockedItems);
          setDragging(null);
          return;
        }

        try {
          const previewRes = await fetch(`/api/order-returns/${returnId}/settlement-preview`, {
            credentials: "include",
            cache: "no-store",
          });
          if (previewRes.ok) {
            const preview = (await previewRes.json()) as { requiresSettlement?: boolean };
            if (preview.requiresSettlement) {
              setPendingSettlement({
                returnId,
                from,
                to,
                currency: ret.order.currency ?? "UAH",
              });
              setDragging(null);
              return;
            }
          }
        } catch {
          /* proceed without preview */
        }
      }

      await applyStatusChange(returnId, from, to);
      setDragging(null);
    },
    [applyStatusChange, dragging?.from, findReturn, isDropAllowed],
  );

  const boardEmpty = columns.every((col) => col.items.length === 0);
  if (anyInitialLoading && boardEmpty) {
    return <div className="text-sm text-zinc-500">{tr.returnsLoadingBoard}</div>;
  }
  if (firstError && boardEmpty) {
    return <div className="text-sm text-red-600">{firstError}</div>;
  }

  const totalUnits = (r: ReturnCard) =>
    r.items.reduce((s, i) => s + (i.qtyReturned ?? 0), 0);

  return (
    <div className="max-w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{tr.returnsHint}</p>
        {onRegisterIncoming ? (
          <button
            type="button"
            onClick={onRegisterIncoming}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {strings.orders.modal.createIncomingPackage}
          </button>
        ) : null}
      </div>
      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`flex-shrink-0 w-[220px] min-w-[220px] rounded-lg border bg-zinc-50/80 ${
              dragOver === col.id ? "border-zinc-900" : "border-zinc-200"
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">{col.title}</div>
              <div className="text-xs text-zinc-500">{col.state?.total ?? col.items.length}</div>
            </div>
            <div
              className={KANBAN_COLUMN_BODY_CLASS}
              onDragOver={(e) => {
                e.preventDefault();
                const from = dragging?.from;
                const ret = dragging ? findReturn(dragging.returnId) : undefined;
                const allowed =
                  from && ret && dragging
                    ? isDropAllowed(ret, from, col.id)
                    : !warehouseMode || !WAREHOUSE_FORBIDDEN_RETURN_STATUSES.includes(col.id);
                e.dataTransfer.dropEffect = allowed ? "move" : "none";
                if (allowed) setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain") || dragging?.returnId;
                if (id) void handleDrop(id, col.id);
              }}
            >
              {col.state?.initialLoading ? (
                <div className="text-xs text-zinc-500">{tr.loadingColumn}</div>
              ) : col.items.length === 0 ? (
                <div className="text-xs text-zinc-500">—</div>
              ) : (
                col.items.map((r) => {
                  const clientName = r.order.client
                    ? `${r.order.client.lastName ?? ""} ${r.order.client.firstName ?? ""}`.trim() || "—"
                    : r.order.company?.name ?? "—";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        if (isTextSelected()) return;
                        if (onOpenReturn) {
                          onOpenReturn(r.id);
                          return;
                        }
                        const oid = r.orderId ?? r.order?.id;
                        if (oid) onOpenOrder(oid);
                      }}
                      draggable
                      onDragStart={(e) => {
                        setDragging({ returnId: r.id, from: r.status });
                        e.dataTransfer.setData("text/plain", r.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`w-full rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm hover:shadow-md ${
                        dragging?.returnId === r.id ? "opacity-60" : ""
                      }`}
                    >
                      <div className="font-medium text-zinc-900">{r.order.orderNumber}</div>
                      {r.reason === "WRONG_ITEM" ? (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          {strings.returns.misPickBadge}
                        </span>
                      ) : r.reason ? (
                        <div className="mt-0.5 text-[10px] text-zinc-500">
                          {returnReasonLabel(r.reason)}
                        </div>
                      ) : null}
                      <div className="mt-0.5 text-xs text-zinc-500">{clientName}</div>
                      <div className="mt-1.5 text-xs text-zinc-500">
                        {formatDate(r.requestedAt)} ·{" "}
                        {r.itemsPending && r.items.length === 0
                          ? tr.itemsPendingBreakdown
                          : tr.positionsUnits(r.items.length, totalUnits(r))}
                      </div>
                      {r.returnPackage?.ttnNumber ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-zinc-500">
                            {tr.ttnPrefix} {r.returnPackage.ttnNumber}
                          </span>
                          <TtnStatusBadge
                            statusCode={r.returnPackage.ttnStatusCode}
                            statusText={r.returnPackage.ttnStatusText}
                          />
                        </div>
                      ) : null}
                      {r.externalCode ? (
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {strings.returns.externalCodeLabel}: {r.externalCode}
                        </div>
                      ) : null}
                      {r.order.debtAmount != null && (
                        <div className="mt-1 text-xs text-amber-700">
                          {strings.contacts.card.kpi.debt}:{" "}
                          {formatOrderAmount(
                            r.order.debtAmount,
                            r.order.currency ?? "UAH",
                            r.order.exchangeRate,
                          )}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-zinc-400">
                        {tr.returnsOrderStage(orderStageLabel(r.order.orderStage))}
                      </div>
                    </button>
                  );
                })
              )}
              {col.state?.hasMore ? (
                <KanbanLoadSentinel
                  disabled={col.state.loadingMore || col.state.initialLoading}
                  onVisible={() => loadMore(col.id)}
                />
              ) : null}
              {col.state?.loadingMore ? (
                <div className="py-1 text-center text-xs text-zinc-400">{tr.loadingColumn}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {pendingSettlement ? (
        <OrderReturnSettlementDialog
          returnId={pendingSettlement.returnId}
          currency={pendingSettlement.currency}
          onCancel={() => setPendingSettlement(null)}
          onConfirm={async (settlement) => {
            const { returnId, from, to } = pendingSettlement;
            setPendingSettlement(null);
            await applyStatusChange(returnId, from, to, settlement);
          }}
        />
      ) : null}
    </div>
  );
}
