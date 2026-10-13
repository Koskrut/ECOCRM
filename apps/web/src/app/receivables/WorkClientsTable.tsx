"use client";

import { Fragment } from "react";
import { formatDate } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";
import type {
  ContactReceivablesResponse,
  WorkClientRow,
  WorkClientsSortKey,
} from "@/lib/api/resources/receivables";
import type { SortDir } from "./receivables-url";
import { ClientRowActions } from "./ClientRowActions";
import { formatMoney } from "./format-money";
import {
  RECONCILE_STATUS_CLASS,
  delayReasonShortLabel,
  reconcileStatusLabel,
} from "./receivables-labels";
import { isSnoozeActive } from "./debt-promise";

const COMMENT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const STICKY_HEAD = "sticky left-0 z-20 bg-zinc-50 shadow-[inset_-1px_0_0_var(--color-zinc-200)]";
const STICKY_CELL =
  "sticky left-0 z-[1] bg-white shadow-[inset_-1px_0_0_var(--color-zinc-100)] group-hover:bg-zinc-50";

function isCommentStale(lastCommentAt: string | null): boolean {
  if (!lastCommentAt) return true;
  const ts = Date.parse(lastCommentAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > COMMENT_STALE_MS;
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  dir,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: WorkClientsSortKey;
  activeSort: WorkClientsSortKey | "";
  dir: SortDir;
  align?: "left" | "right";
  onSort?: (key: WorkClientsSortKey) => void;
}) {
  if (!onSort) {
    return <th className={`px-3 py-3 ${align === "right" ? "text-right" : ""}`}>{label}</th>;
  }
  const active = activeSort === sortKey;
  const arrow = active ? (dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={`px-3 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`font-inherit uppercase hover:text-zinc-800 ${
          active ? "text-zinc-800" : "text-zinc-500"
        }`}
      >
        {label}
        {arrow}
      </button>
    </th>
  );
}

export type WorkClientsTableProps = {
  rows: WorkClientRow[];
  currency: string;
  /** Hidden for MANAGER role: every row is their own. */
  showManager: boolean;
  expandedClients: Set<string>;
  clientDetails: Map<string, ContactReceivablesResponse>;
  clientDetailsLoading: Set<string>;
  selectedIds: Set<string>;
  sort?: WorkClientsSortKey | "";
  dir?: SortDir;
  onSort?: (key: WorkClientsSortKey) => void;
  onToggleSelect: (contactId: string) => void;
  onToggleSelectAll: () => void;
  onToggleExpand: (contactId: string) => void;
  onOpenContact: (id: string) => void;
  onOpenOrder: (id: string) => void;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
  onRemind?: (row: WorkClientRow) => void;
};

export function WorkClientsTable({
  rows,
  currency,
  showManager,
  expandedClients,
  clientDetails,
  clientDetailsLoading,
  selectedIds,
  sort = "",
  dir = "desc",
  onSort,
  onToggleSelect,
  onToggleSelectAll,
  onToggleExpand,
  onOpenContact,
  onOpenOrder,
  onComment,
  onCopyPay,
  onRemind,
}: WorkClientsTableProps) {
  const t = strings.receivables;
  if (rows.length === 0) {
    return <div className="text-sm text-zinc-500">{t.noClients}</div>;
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.contactId));
  const colCount = showManager ? 10 : 9;

  return (
    <div className="max-h-[min(70vh,calc(100dvh-18rem))] overflow-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 text-left text-xs uppercase text-zinc-500 backdrop-blur supports-[backdrop-filter]:bg-zinc-50/80">
          <tr>
            <th className={`${STICKY_HEAD} px-3 py-3`}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-zinc-300"
                  aria-label={t.selectAll}
                />
                <span className="w-4" aria-hidden="true" />
                <span>{t.colClient}</span>
              </div>
            </th>
            <th className="px-3 py-3">{t.colCode1C}</th>
            <SortHeader
              label={t.colDebt}
              sortKey="debt"
              activeSort={sort}
              dir={dir}
              align="right"
              onSort={onSort}
            />
            <SortHeader
              label={t.colOverdue}
              sortKey="overdue"
              activeSort={sort}
              dir={dir}
              align="right"
              onSort={onSort}
            />
            <SortHeader
              label={t.colOverdueDays}
              sortKey="overdueDays"
              activeSort={sort}
              dir={dir}
              align="right"
              onSort={onSort}
            />
            <th className="px-3 py-3 text-right">{t.colOrders}</th>
            <SortHeader
              label={t.colLastPayment}
              sortKey="lastPayment"
              activeSort={sort}
              dir={dir}
              onSort={onSort}
            />
            {showManager ? <th className="px-3 py-3">{t.colManager}</th> : null}
            <SortHeader
              label={t.colLastComment}
              sortKey="lastComment"
              activeSort={sort}
              dir={dir}
              onSort={onSort}
            />
            <th className="px-3 py-3">{t.colActions}</th>
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
            const overpayment = row.overpaymentAmount ?? 0;
            const snoozed = isSnoozeActive(row.snoozedUntil);
            return (
              <Fragment key={row.contactId}>
                <tr className="group hover:bg-zinc-50">
                  <td className={`${STICKY_CELL} px-3 py-3`}>
                    <div className="flex min-w-[12rem] max-w-[18rem] items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.contactId)}
                        onChange={() => onToggleSelect(row.contactId)}
                        className="shrink-0 rounded border-zinc-300"
                        aria-label={`${t.selectRow} ${row.clientName}`}
                      />
                      <button
                        type="button"
                        onClick={() => onToggleExpand(row.contactId)}
                        className="w-4 shrink-0 text-zinc-500 hover:text-zinc-800"
                        aria-label={expanded ? t.collapseDetails : t.expandDetails}
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 text-left font-medium text-zinc-900 underline-offset-2 hover:underline"
                        onClick={() => onOpenContact(row.contactId)}
                      >
                        {row.clientName}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs text-zinc-600">
                        {row.externalCode ?? "—"}
                      </span>
                      {reconcile && reconcile !== "ALIGNED" ? (
                        <span
                          className={`inline-flex w-fit whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${RECONCILE_STATUS_CLASS[reconcile]}`}
                        >
                          {reconcileStatusLabel(reconcile)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{formatMoney(row.debtAmount, currency)}</div>
                    {overpayment > 0 ? (
                      <div className="mt-0.5 text-xs text-emerald-700">
                        {t.overpaymentShort(formatMoney(overpayment, currency))}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-red-600">
                    {row.overdueAmount > 0 ? formatMoney(row.overdueAmount, currency) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-700">
                    {row.overdueDays && row.overdueDays > 0 ? row.overdueDays : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.orderCount}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                    {row.lastPaymentAt ? formatDate(row.lastPaymentAt.slice(0, 10)) : "—"}
                  </td>
                  {showManager ? (
                    <td className="px-3 py-3 text-zinc-600">{row.ownerName ?? "—"}</td>
                  ) : null}
                  <td className="max-w-[16rem] px-3 py-3">
                    {snoozed && row.snoozedUntil ? (
                      <span className="mb-1 mr-1 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800 ring-1 ring-sky-200">
                        {t.snoozedUntil(formatDate(row.snoozedUntil))}
                      </span>
                    ) : null}
                    {reason ? (
                      <span className="mb-1 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                        {delayReasonShortLabel(reason)}
                      </span>
                    ) : null}
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
                      <div className="text-xs text-amber-700">{t.commentNone}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
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
