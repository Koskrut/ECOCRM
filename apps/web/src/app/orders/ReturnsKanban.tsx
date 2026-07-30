"use client";

import { useCallback, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { isTextSelected } from "@/lib/dom";
import { formatDate } from "@/lib/crmDatetime";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import {
  KanbanLoadSentinel,
  KANBAN_COLUMN_BODY_CLASS,
} from "@/components/kanban/KanbanLoadSentinel";
import { useKanbanInfiniteColumns } from "@/components/kanban/useKanbanInfiniteColumns";
import { strings } from "@/locales";

/** Phase 5: Returns kanban — columns by ReturnStatus, drag-and-drop to change status (validated on backend). */

type ReturnStatus =
  | "REQUESTED"
  | "APPROVED"
  | "IN_TRANSIT_BACK"
  | "RECEIVED_BY_WAREHOUSE"
  | "INSPECTION"
  | "REFUND_OR_ADJUSTMENT"
  | "CLOSED";

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
  requestedAt: string;
  closedAt?: string | null;
  createdAt: string;
  itemsPending?: boolean;
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

const COLUMN_ORDER: ReturnStatus[] = [
  "REQUESTED",
  "APPROVED",
  "IN_TRANSIT_BACK",
  "RECEIVED_BY_WAREHOUSE",
  "INSPECTION",
  "REFUND_OR_ADJUSTMENT",
  "CLOSED",
];

const STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Заявлено",
  APPROVED: "Погоджено",
  IN_TRANSIT_BACK: "В дорозі назад",
  RECEIVED_BY_WAREHOUSE: "Прийнято на склад",
  INSPECTION: "Перевірка",
  REFUND_OR_ADJUSTMENT: "Повернення коштів",
  CLOSED: "Закрито",
};

export function ReturnsKanban({
  onOpenOrder,
  onOpenReturn,
  refreshKey = 0,
  onRegisterIncoming,
}: {
  onOpenOrder: (orderId: string) => void;
  onOpenReturn?: (returnId: string) => void;
  /** Increment to force refetch (e.g. after creating a return from order modal). */
  refreshKey?: number;
  onRegisterIncoming?: () => void;
}) {
  const [dragging, setDragging] = useState<{ returnId: string; from: ReturnStatus } | null>(null);
  const [dragOver, setDragOver] = useState<ReturnStatus | null>(null);

  const buildParams = useCallback((status: ReturnStatus, page: number): Record<string, string> => {
    return {
      status,
      page: String(page),
    };
  }, []);

  const fetchPage = useCallback(async (params: Record<string, string>) => {
    const res = await apiHttp.get<ReturnsListResponse>("/order-returns", { params });
    const data = res.data ?? { items: [] };
    return {
      items: data.items ?? [],
      total: data.total ?? data.items?.length ?? 0,
    };
  }, []);

  const { columns: columnStates, loadMore, moveItem, reloadAll, anyInitialLoading, firstError } =
    useKanbanInfiniteColumns<ReturnCard, ReturnStatus>({
      columnIds: COLUMN_ORDER,
      buildParams,
      fetchPage,
      resetKey: refreshKey,
    });

  const columns = useMemo(
    () =>
      COLUMN_ORDER.map((id) => ({
        id,
        title: STATUS_LABELS[id],
        items: columnStates[id]?.items ?? [],
        state: columnStates[id],
      })),
    [columnStates],
  );

  const patchStatus = useCallback(async (returnId: string, status: ReturnStatus) => {
    await apiHttp.patch(`/order-returns/${returnId}/status`, { status });
  }, []);

  const handleDrop = useCallback(
    async (returnId: string, to: ReturnStatus) => {
      const from = dragging?.from;
      if (from === to) {
        setDragging(null);
        return;
      }
      if (from) {
        moveItem(returnId, from, to, (r) => ({ ...r, status: to }));
      }
      try {
        await patchStatus(returnId, to);
        reloadAll();
      } catch (e) {
        alert(e instanceof Error ? e.message : strings.kanban.statusUpdateFailed);
        reloadAll();
      } finally {
        setDragging(null);
      }
    },
    [dragging, moveItem, patchStatus, reloadAll],
  );

  const boardEmpty = columns.every((col) => col.items.length === 0);
  if (anyInitialLoading && boardEmpty) {
    return <div className="text-sm text-zinc-500">Завантаження повернень…</div>;
  }
  if (firstError && boardEmpty) {
    return <div className="text-sm text-red-600">{firstError}</div>;
  }

  const totalUnits = (r: ReturnCard) =>
    r.items.reduce((s, i) => s + (i.qtyReturned ?? 0), 0);

  return (
    <div className="max-w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          Канбан повернень. Перетягування змінює статус (переходи валідуються на сервері).
        </p>
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
                e.dataTransfer.dropEffect = "move";
                setDragOver(col.id);
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
                <div className="text-xs text-zinc-500">Завантаження…</div>
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
                        const oid = r.orderId ?? r.order?.id;
                        if (!oid) return;
                        if (onOpenReturn) {
                          onOpenReturn(r.id);
                        } else {
                          onOpenOrder(oid);
                        }
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
                      <div className="mt-0.5 text-xs text-zinc-500">{clientName}</div>
                      <div className="mt-1.5 text-xs text-zinc-500">
                        {formatDate(r.requestedAt)} ·{" "}
                        {r.itemsPending && r.items.length === 0
                          ? "очікує розбору"
                          : `${r.items.length} поз. · ${totalUnits(r)} од.`}
                      </div>
                      {r.returnPackage?.ttnNumber ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-zinc-500">
                            ТТН {r.returnPackage.ttnNumber}
                          </span>
                          <TtnStatusBadge
                            statusCode={r.returnPackage.ttnStatusCode}
                            statusText={r.returnPackage.ttnStatusText}
                          />
                        </div>
                      ) : null}
                      {r.order.debtAmount != null && (
                        <div className="mt-1 text-xs text-amber-700">
                          Борг:{" "}
                          {formatOrderAmount(
                            r.order.debtAmount,
                            r.order.currency ?? "UAH",
                            r.order.exchangeRate,
                          )}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-zinc-400">
                        Заказ: {r.order.orderStage ?? "—"}
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
                <div className="py-1 text-center text-xs text-zinc-400">Завантаження…</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
