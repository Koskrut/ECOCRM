"use client";

import { Fragment } from "react";
import { formatDate } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";
import type {
  ContactReceivablesResponse,
  ReceivablesReconcileStatus,
  WorkClientRow,
} from "@/lib/api/resources/receivables";
import { ClientRowActions } from "./ClientRowActions";
import { formatMoney } from "./format-money";

const COMMENT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const RECONCILE_STATUS_LABELS: Record<ReceivablesReconcileStatus, string> = {
  ALIGNED: "Збіг",
  DELTA_1C_MORE: "1С більше",
  DELTA_CRM_MORE: "CRM більше",
  ONLY_1C: "Тільки в 1С",
  ONLY_CRM: "Тільки в CRM",
};

const RECONCILE_STATUS_CLASS: Record<ReceivablesReconcileStatus, string> = {
  ALIGNED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELTA_1C_MORE: "bg-amber-50 text-amber-800 ring-amber-200",
  DELTA_CRM_MORE: "bg-orange-50 text-orange-800 ring-orange-200",
  ONLY_1C: "bg-red-50 text-red-700 ring-red-200",
  ONLY_CRM: "bg-violet-50 text-violet-800 ring-violet-200",
};

const DELAY_REASON_LABELS: Record<string, string> = {
  WAITING_ACT: "Чекаємо акт",
  CLIENT_DELAY: "Клієнт затримує",
  DISPUTE: "Спір по товару",
  OTHER: "Інше",
};

function isCommentStale(lastCommentAt: string | null): boolean {
  if (!lastCommentAt) return true;
  const ts = Date.parse(lastCommentAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > COMMENT_STALE_MS;
}

export function WorkClientsTable({
  rows,
  currency,
  expandedClients,
  clientDetails,
  clientDetailsLoading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleExpand,
  onOpenContact,
  onOpenOrder,
  onComment,
  onCopyPay,
  onRemind,
}: {
  rows: WorkClientRow[];
  currency: string;
  expandedClients: Set<string>;
  clientDetails: Map<string, ContactReceivablesResponse>;
  clientDetailsLoading: Set<string>;
  selectedIds: Set<string>;
  onToggleSelect: (contactId: string) => void;
  onToggleSelectAll: () => void;
  onToggleExpand: (contactId: string) => void;
  onOpenContact: (id: string) => void;
  onOpenOrder: (id: string) => void;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
  onRemind?: (row: WorkClientRow) => void;
}) {
  const t = strings.receivables;
  if (rows.length === 0) {
    return <div className="text-sm text-zinc-500">{t.noClients}</div>;
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.contactId));
  const colCount = 13;

  return (
    <div className="max-h-[min(70vh,calc(100dvh-18rem))] overflow-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 text-left text-xs uppercase text-zinc-500 backdrop-blur supports-[backdrop-filter]:bg-zinc-50/80">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded border-zinc-300"
                aria-label={t.selectAll}
              />
            </th>
            <th className="w-8 px-2 py-3" />
            <th className="px-4 py-3">{t.colClient}</th>
            <th className="px-4 py-3">{t.colCode1C}</th>
            <th className="px-4 py-3 text-right">{t.colDebt}</th>
            <th className="px-4 py-3 text-right">{t.colOverdue}</th>
            <th className="px-4 py-3 text-right">{t.colOverpayment}</th>
            <th className="px-4 py-3 text-right">{t.colOrders}</th>
            <th className="px-4 py-3">{t.colLastPayment}</th>
            <th className="px-4 py-3">{t.colManager}</th>
            <th className="px-4 py-3">{t.colLastComment}</th>
            <th className="px-4 py-3">{t.colDelayReason}</th>
            <th className="px-4 py-3">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const stale = isCommentStale(row.lastCommentAt);
            const expanded = expandedClients.has(row.contactId);
            const detail = clientDetails.get(row.contactId);
            const loadingDetail = clientDetailsLoading.has(row.contactId);
            const reconcile = row.reconcileStatus;
            const reason = row.delayReasonCode;
            return (
              <Fragment key={row.contactId}>
                <tr className="group hover:bg-zinc-50">
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.contactId)}
                      onChange={() => onToggleSelect(row.contactId)}
                      className="rounded border-zinc-300"
                      aria-label={`${t.selectRow} ${row.clientName}`}
                    />
                  </td>
                  <td className="px-2 py-3">
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
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs text-zinc-600">
                        {row.externalCode ?? "—"}
                      </span>
                      {reconcile && reconcile !== "ALIGNED" ? (
                        <span
                          className={`inline-flex w-fit rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${RECONCILE_STATUS_CLASS[reconcile]}`}
                        >
                          {RECONCILE_STATUS_LABELS[reconcile]}
                        </span>
                      ) : null}
                    </div>
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
                  <td className="px-4 py-3 max-w-[14rem]">
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
                    {reason ? (
                      <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        {DELAY_REASON_LABELS[reason] ?? reason}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ClientRowActions
                      row={row}
                      onComment={onComment}
                      onCopyPay={onCopyPay}
                      onRemind={onRemind}
                    />
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-zinc-50/80">
                    <td colSpan={colCount} className="px-6 py-4">
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
