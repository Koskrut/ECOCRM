"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";
import {
  receivablesApi,
  type ContactReceivablesResponse,
  type ReceivablesReconcileStatus,
} from "@/lib/api/resources/receivables";

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

const FINANCIAL_LABELS: Record<string, string> = {
  INVOICE_PENDING: "Потрібно виставити рахунок",
  AWAITING_PAYMENT: "Очікуємо оплату",
  DUE_SOON: "Термін скоро",
  OVERDUE: "Прострочено",
  PAID: "Оплачено",
  CLOSED: "Закрито",
};

function formatMoney(amount: number, currency: string) {
  const sym = currency === "EUR" ? "€" : "$";
  return `${amount.toFixed(2)} ${sym}`;
}

function KpiCard({
  title,
  value,
  variant = "default",
}: {
  title: string;
  value: string;
  variant?: "default" | "risk";
}) {
  const ring = variant === "risk" ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-lg border p-3 ${ring}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}

export function ContactReceivablesTab({
  contactId,
  financeRestricted,
  onOpenOrder,
}: {
  contactId: string;
  financeRestricted?: boolean;
  onOpenOrder: (orderId: string) => void;
}) {
  const t = strings.receivables;
  const [data, setData] = useState<ContactReceivablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await receivablesApi.contactReceivables(contactId);
      setData(res.data);
    } catch {
      setError(t.loadError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [contactId, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (financeRestricted) {
    return (
      <p className="text-sm text-zinc-500">
        Фінансові дані обмежені вашим scope — частина боргу може бути прихована.
      </p>
    );
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">{strings.common.loading}</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const currency = data.currency;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-zinc-600">
          {data.externalCode ? (
            <>
              Код 1С: <span className="font-mono text-xs">{data.externalCode}</span>
            </>
          ) : (
            <span className="text-amber-700">Код 1С не вказано</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/payments?contactId=${contactId}`}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.actionPayments}
          </Link>
          <Link
            href={`/receivables?tab=work&contactId=${contactId}`}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.openFullPage}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          title={t.kpiDebtOperational}
          value={formatMoney(data.kpi.debtTotal, currency)}
          variant={data.kpi.debtTotal > 0 ? "risk" : "default"}
        />
        <KpiCard
          title={t.kpiOverdue}
          value={formatMoney(data.kpi.overdueDebt, currency)}
          variant={data.kpi.overdueDebt > 0 ? "risk" : "default"}
        />
        <KpiCard title={t.kpiOrders} value={String(data.kpi.ordersWithDebtCount)} />
        <KpiCard
          title={t.kpiBitrixLegacy}
          value={formatMoney(data.kpi.bitrixLegacyDebt, currency)}
          variant="default"
        />
      </div>

      {data.kpi.bitrixLegacyDebt > 0 ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          {t.kpiBitrixLegacy}: {formatMoney(data.kpi.bitrixLegacyDebt, currency)} — {t.kpiBitrixLegacyHint}
        </div>
      ) : null}

      {data.reconciliation ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-zinc-900">{t.contactReconcileTitle}</div>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                RECONCILE_STATUS_CLASS[data.reconciliation.status]
              }`}
            >
              {RECONCILE_STATUS_LABELS[data.reconciliation.status]}
            </span>
          </div>
          <div className="text-xs text-zinc-500">
            Знімок від {formatDate(data.reconciliation.snapshotDate.slice(0, 10))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-zinc-500">{t.kpi1CTotal}</div>
              <div className="font-medium tabular-nums">
                {formatMoney(data.reconciliation.amount1C, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t.kpiCRMTotal}</div>
              <div className="font-medium tabular-nums">
                {formatMoney(data.reconciliation.amountCRM, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t.kpiDelta}</div>
              <div className="font-medium tabular-nums">
                {formatMoney(data.reconciliation.delta, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t.colCode1C}</div>
              <div className="font-mono text-xs">{data.reconciliation.counterpartyCode1C}</div>
            </div>
          </div>
          {data.reconciliation.status !== "ALIGNED" ? (
            <Link
              href={`/receivables?tab=reconcile&snapshotId=${data.reconciliation.snapshotId}&q=${encodeURIComponent(data.reconciliation.counterpartyCode1C)}`}
              className="mt-2 inline-flex text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
            >
              {t.openReconcile}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
          {t.contactNoSnapshot}
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-medium text-zinc-900">{t.viewOrders}</div>
        {data.orders.length === 0 ? (
          <div className="text-sm text-zinc-500">{t.noOrders}</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">{t.colOrder}</th>
                  <th className="px-3 py-2 text-right">{t.colDebt}</th>
                  <th className="px-3 py-2">{t.colDue}</th>
                  <th className="px-3 py-2">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.orders.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => onOpenOrder(row.id)}
                  >
                    <td className="px-3 py-2 font-medium">{row.orderNumber}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatOrderAmount(row.debtAmount, row.currency)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {row.paymentDueDate ? formatDate(row.paymentDueDate.slice(0, 10)) : "—"}
                    </td>
                    <td className="px-3 py-2">
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
        )}
        {data.ordersTotal > data.orders.length ? (
          <div className="mt-2 text-xs text-zinc-500">
            Показано {data.orders.length} з {data.ordersTotal}.{" "}
            <Link
              href={`/receivables?tab=work&view=orders&contactId=${contactId}`}
              className="font-medium text-zinc-700 underline"
            >
              {t.openFullPage}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
