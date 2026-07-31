"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { formatDate } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import {
  checklistLegLabel,
  outboundLegLabel,
  replacementModeLabel,
  returnReasonLabel,
} from "@/lib/returns/return-labels";
import { OrderReturnSettlementDialog } from "./OrderClientBalancePanel";

const tr = strings.returns;

type ReturnStatus =
  | "REQUESTED"
  | "APPROVED"
  | "IN_TRANSIT_BACK"
  | "RECEIVED_BY_WAREHOUSE"
  | "INSPECTION"
  | "REFUND_OR_ADJUSTMENT"
  | "CLOSED";

const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Заявлено",
  APPROVED: "Погоджено",
  IN_TRANSIT_BACK: "В дорозі назад",
  RECEIVED_BY_WAREHOUSE: "Прийнято на склад",
  INSPECTION: "Перевірка",
  REFUND_OR_ADJUSTMENT: "Повернення коштів",
  CLOSED: "Закрито",
};

const NEXT_RETURN_STATUS: Partial<Record<ReturnStatus, ReturnStatus>> = {
  REQUESTED: "APPROVED",
  APPROVED: "IN_TRANSIT_BACK",
  IN_TRANSIT_BACK: "RECEIVED_BY_WAREHOUSE",
  RECEIVED_BY_WAREHOUSE: "INSPECTION",
  INSPECTION: "REFUND_OR_ADJUSTMENT",
  REFUND_OR_ADJUSTMENT: "CLOSED",
};

const ALL_STATUSES: ReturnStatus[] = [
  "REQUESTED",
  "APPROVED",
  "IN_TRANSIT_BACK",
  "RECEIVED_BY_WAREHOUSE",
  "INSPECTION",
  "REFUND_OR_ADJUSTMENT",
  "CLOSED",
];

type ReturnDetails = {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason?: string;
  replacementMode?: string | null;
  inboundDoneAt?: string | null;
  outboundDoneAt?: string | null;
  inboundWaivedAt?: string | null;
  outboundWaivedAt?: string | null;
  inboundWaiveReason?: string | null;
  outboundWaiveReason?: string | null;
  requestedAt: string;
  closedAt?: string | null;
  itemsPending?: boolean;
  creditAmount?: number | null;
  refundAmount?: number | null;
  settledAt?: string | null;
  settlementType?: string | null;
  replacementOrder?: {
    id: string;
    orderNumber: string;
    orderStage?: string | null;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    orderStage?: string | null;
    currency?: string;
    exchangeRate?: number | null;
    company?: { id: string; name: string } | null;
    client?: { id: string; firstName: string; lastName: string } | null;
  };
  items: Array<{
    id: string;
    orderItemId: string;
    qtyReturned: number;
    disposition?: string;
    actualProduct?: { id: string; name: string; sku: string | null } | null;
    orderItem?: {
      id: string;
      qty: number;
      price: number;
      lineTotal: number;
      productNameSnapshot?: string | null;
      product?: { id: string; name: string; sku: string | null } | null;
    };
  }>;
  returnPackage?: {
    id: string;
    ttnNumber: string;
    status: string;
    ttnStatusCode?: string | null;
    ttnStatusText?: string | null;
  } | null;
};

function clientLabel(ret: ReturnDetails): string {
  if (ret.order.client) {
    const full = `${ret.order.client.lastName ?? ""} ${ret.order.client.firstName ?? ""}`.trim();
    return full || "—";
  }
  return ret.order.company?.name ?? "—";
}

function isMisPick(ret: ReturnDetails): boolean {
  return ret.reason === "WRONG_ITEM";
}

function inboundLegState(ret: ReturnDetails): "pending" | "done" | "waived" {
  if (ret.inboundWaivedAt) return "waived";
  if (ret.inboundDoneAt) return "done";
  return "pending";
}

function outboundLegState(ret: ReturnDetails): "pending" | "done" | "waived" {
  if (ret.outboundWaivedAt) return "waived";
  if (ret.outboundDoneAt) return "done";
  return "pending";
}

function getNextReturnStatus(ret: ReturnDetails): ReturnStatus | undefined {
  if (isMisPick(ret)) {
    if (ret.status === "INSPECTION") {
      const inbound = inboundLegState(ret);
      const outbound = outboundLegState(ret);
      const ready =
        (inbound === "done" || inbound === "waived") &&
        (outbound === "done" || outbound === "waived");
      if (!ready) return undefined;
      if (ret.outboundWaivedAt) return "REFUND_OR_ADJUSTMENT";
      return "CLOSED";
    }
  }
  return NEXT_RETURN_STATUS[ret.status];
}

export function ReturnModal({
  returnId,
  onClose,
  onSaved,
  onOpenOrder,
}: {
  returnId: string;
  onClose: () => void;
  onSaved?: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const [ret, setRet] = useState<ReturnDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ReturnStatus | "">("");
  const [pendingSettlement, setPendingSettlement] = useState<{
    returnId: string;
    nextStatus: ReturnStatus;
  } | null>(null);
  const [waiveLeg, setWaiveLeg] = useState<"inbound" | "outbound" | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiveSubmitting, setWaiveSubmitting] = useState(false);

  const loadReturn = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/order-returns/${returnId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Помилка (${r.status})`);
      }
      const data = (await r.json()) as ReturnDetails;
      setRet(data);
      setSelectedStatus(data.status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити повернення");
      setRet(null);
    } finally {
      setLoading(false);
    }
  }, [returnId]);

  useEffect(() => {
    void loadReturn();
  }, [loadReturn]);

  const currency = ret?.order.currency ?? "UAH";

  const itemsTotal = useMemo(() => {
    if (!ret?.items?.length) return 0;
    return ret.items.reduce((sum, it) => {
      const line = it.orderItem?.lineTotal ?? 0;
      const qty = it.orderItem?.qty ?? 1;
      const unit = qty > 0 ? line / qty : 0;
      return sum + unit * it.qtyReturned;
    }, 0);
  }, [ret?.items]);

  const updateReturnStatus = useCallback(
    async (
      status: ReturnStatus,
      settlement?: {
        type: "CREDIT" | "REFUND" | "SPLIT";
        creditAmount?: number;
        refundAmount?: number;
      },
    ) => {
      setStatusUpdating(true);
      setErr(null);
      try {
        const r = await fetch(`/api/order-returns/${returnId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, settlement }),
          credentials: "include",
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(
            (body as { message?: string }).message ??
              `Не вдалося оновити статус повернення (${r.status})`,
          );
        }
        await loadReturn();
        onSaved?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Помилка оновлення статусу");
      } finally {
        setStatusUpdating(false);
      }
    },
    [returnId, loadReturn, onSaved],
  );

  const advanceReturnStatus = useCallback(async () => {
    if (!ret) return;
    const nextStatus = getNextReturnStatus(ret);
    if (!nextStatus) return;

    if (nextStatus === "CLOSED" && ret.status === "REFUND_OR_ADJUSTMENT") {
      try {
        const previewRes = await fetch(`/api/order-returns/${returnId}/settlement-preview`, {
          credentials: "include",
          cache: "no-store",
        });
        if (previewRes.ok) {
          const preview = (await previewRes.json()) as { requiresSettlement?: boolean };
          if (preview.requiresSettlement) {
            setPendingSettlement({ returnId, nextStatus });
            return;
          }
        }
      } catch {
        /* proceed without preview */
      }
    }

    await updateReturnStatus(nextStatus);
  }, [ret, returnId, updateReturnStatus]);

  const applySelectedStatus = useCallback(async () => {
    if (!ret || !selectedStatus || selectedStatus === ret.status) return;

    if (selectedStatus === "CLOSED" && ret.status === "REFUND_OR_ADJUSTMENT") {
      try {
        const previewRes = await fetch(`/api/order-returns/${returnId}/settlement-preview`, {
          credentials: "include",
          cache: "no-store",
        });
        if (previewRes.ok) {
          const preview = (await previewRes.json()) as { requiresSettlement?: boolean };
          if (preview.requiresSettlement) {
            setPendingSettlement({ returnId, nextStatus: selectedStatus });
            return;
          }
        }
      } catch {
        /* proceed */
      }
    }

    await updateReturnStatus(selectedStatus);
  }, [ret, returnId, selectedStatus, updateReturnStatus]);

  const nextStatus = ret ? getNextReturnStatus(ret) : undefined;

  const submitWaive = useCallback(async () => {
    if (!ret || !waiveLeg || waiveReason.trim().length < 3) return;
    setWaiveSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/order-returns/${returnId}/waive-checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg: waiveLeg, reason: waiveReason.trim() }),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Не вдалося зняти пункт");
      }
      setWaiveLeg(null);
      setWaiveReason("");
      await loadReturn();
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка зняття");
    } finally {
      setWaiveSubmitting(false);
    }
  }, [ret, waiveLeg, waiveReason, returnId, loadReturn, onSaved]);

  const left = loading ? (
    <p className="text-sm text-zinc-500">{strings.common.loading}</p>
  ) : err && !ret ? (
    <p className="text-sm text-red-600">{err}</p>
  ) : ret ? (
    <div className="space-y-4">
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Статус</div>
          <div className="mt-1 text-sm font-medium text-zinc-900">
            {RETURN_STATUS_LABELS[ret.status] ?? ret.status}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Заявлено</div>
          <div className="mt-1 text-sm text-zinc-800">{formatDate(ret.requestedAt)}</div>
        </div>
        {ret.closedAt ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Закрито</div>
            <div className="mt-1 text-sm text-zinc-800">{formatDate(ret.closedAt)}</div>
          </div>
        ) : null}
        {ret.itemsPending ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Розбір</div>
            <div className="mt-1 text-sm text-amber-800">Очікує розбору на складі</div>
          </div>
        ) : null}
        {ret.reason ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Причина</div>
            <div className="mt-1 text-sm text-zinc-800">{returnReasonLabel(ret.reason)}</div>
          </div>
        ) : null}
        {ret.replacementMode ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Режим</div>
            <div className="mt-1 text-sm text-zinc-800">
              {replacementModeLabel(ret.replacementMode)}
            </div>
          </div>
        ) : null}
      </div>

      {isMisPick(ret) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-900">
            {tr.misPickBadge}
          </div>
          <ul className="mt-2 space-y-2">
            <li className="flex items-center justify-between gap-2">
              <span>{tr.checklistInbound}</span>
              <span className="font-medium text-zinc-800">
                {checklistLegLabel(inboundLegState(ret))}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>{tr.checklistOutbound}</span>
              <span className="font-medium text-zinc-800">
                {outboundLegState(ret) === "done"
                  ? outboundLegLabel(true, false)
                  : checklistLegLabel(outboundLegState(ret))}
              </span>
            </li>
          </ul>
          {ret.replacementOrder ? (
            <button
              type="button"
              onClick={() => onOpenOrder(ret.replacementOrder!.id)}
              className="mt-2 text-xs font-medium text-zinc-800 underline"
            >
              {tr.openReplacementOrder} №{ret.replacementOrder.orderNumber}
            </button>
          ) : null}
        </div>
      ) : null}

      {ret.returnPackage?.ttnNumber ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-xs font-medium text-zinc-500">ТТН повернення</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">{ret.returnPackage.ttnNumber}</span>
            <TtnStatusBadge
              statusCode={ret.returnPackage.ttnStatusCode}
              statusText={ret.returnPackage.ttnStatusText}
            />
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Позиції</div>
        {ret.items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {ret.itemsPending ? "Позиції ще не визначені" : "Немає позицій"}
          </p>
        ) : (
          <ul className="space-y-2">
            {ret.items.map((it) => {
              const name =
                it.orderItem?.productNameSnapshot ??
                it.orderItem?.product?.name ??
                it.orderItem?.product?.sku ??
                "—";
              const actualName =
                it.actualProduct?.name ?? it.actualProduct?.sku ?? null;
              return (
                <li
                  key={it.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    {it.orderItem?.product?.sku ? (
                      <div className="text-[11px] text-zinc-500">{it.orderItem.product.sku}</div>
                    ) : null}
                    <div className="truncate text-zinc-800">{name}</div>
                    {actualName ? (
                      <div className="mt-0.5 text-xs text-amber-800">
                        {tr.actualProduct}: {actualName}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-zinc-600">
                    <div>{it.qtyReturned} од.</div>
                    {it.orderItem?.price != null ? (
                      <div className="text-xs text-zinc-500">
                        {formatOrderAmount(it.orderItem.price, currency, ret.order.exchangeRate)}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {itemsTotal > 0 ? (
          <div className="mt-2 text-right text-sm text-zinc-600">
            Орієнтовна сума позицій:{" "}
            {formatOrderAmount(itemsTotal, currency, ret.order.exchangeRate)}
          </div>
        ) : null}
      </div>

      {(Number(ret.creditAmount ?? 0) > 0 ||
        Number(ret.refundAmount ?? 0) > 0 ||
        ret.settledAt) && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Розрахунок</div>
          {Number(ret.creditAmount ?? 0) > 0 ? (
            <div className="mt-1">Залік: {formatOrderAmount(Number(ret.creditAmount), currency)}</div>
          ) : null}
          {Number(ret.refundAmount ?? 0) > 0 ? (
            <div className="mt-0.5">
              Повернення коштів: {formatOrderAmount(Number(ret.refundAmount), currency)}
            </div>
          ) : null}
          {ret.settledAt ? (
            <div className="mt-0.5 text-xs text-zinc-500">
              Проведено: {formatDate(ret.settledAt)}
              {ret.settlementType ? ` · ${ret.settlementType}` : ""}
            </div>
          ) : null}
        </div>
      )}
    </div>
  ) : null;

  const right = ret ? (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Статус</div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!nextStatus || statusUpdating}
            onClick={() => void advanceReturnStatus()}
            className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {statusUpdating
              ? "Оновлення…"
              : nextStatus
                ? `Наступний: ${RETURN_STATUS_LABELS[nextStatus]}`
                : isMisPick(ret) && ret.status === "INSPECTION"
                  ? tr.closeBlockedMisPick
                  : "Наступний статус"}
          </button>
          {isMisPick(ret) ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(ret.inboundDoneAt || ret.inboundWaivedAt) || waiveSubmitting}
                onClick={() => setWaiveLeg("inbound")}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {tr.waiveLeg}: {tr.checklistInbound.toLowerCase()}
              </button>
              <button
                type="button"
                disabled={Boolean(ret.outboundDoneAt || ret.outboundWaivedAt) || waiveSubmitting}
                onClick={() => setWaiveLeg("outbound")}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {tr.waiveLeg}: {tr.checklistOutbound.toLowerCase()}
              </button>
            </div>
          ) : null}
          {waiveLeg ? (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <input
                type="text"
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                placeholder={tr.waiveReasonPlaceholder}
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={waiveSubmitting || waiveReason.trim().length < 3}
                  onClick={() => void submitWaive()}
                  className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                >
                  {tr.waiveLeg}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWaiveLeg(null);
                    setWaiveReason("");
                  }}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                >
                  {strings.common.cancel}
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as ReturnStatus)}
              disabled={statusUpdating}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RETURN_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedStatus || selectedStatus === ret.status || statusUpdating}
              onClick={() => void applySelectedStatus()}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Застосувати
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenOrder(ret.order.id)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Відкрити замовлення №{ret.order.orderNumber}
      </button>
    </div>
  ) : null;

  return (
    <>
      <EntityModalShell
        title={ret ? `Повернення · №${ret.order.orderNumber}` : "Повернення"}
        subtitle={ret ? clientLabel(ret) : undefined}
        left={left}
        right={right}
        canClose={!statusUpdating}
        onClose={onClose}
        size="default"
      />
      {pendingSettlement ? (
        <OrderReturnSettlementDialog
          returnId={pendingSettlement.returnId}
          currency={currency}
          onCancel={() => setPendingSettlement(null)}
          onConfirm={async (payload) => {
            await updateReturnStatus(pendingSettlement.nextStatus, payload);
            setPendingSettlement(null);
          }}
        />
      ) : null}
    </>
  );
}
