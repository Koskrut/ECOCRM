"use client";

import { formatDate } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";
import type { WorkOrderRow } from "@/lib/api/resources/receivables";
import { financialStatusLabel } from "./receivables-labels";

export function WorkOrdersTable({
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
            <th className="px-3 py-3">{t.colOrder}</th>
            <th className="px-3 py-3">{t.colClient}</th>
            <th className="px-3 py-3">{t.colCode1C}</th>
            <th className="px-3 py-3 text-right">{t.colDebt}</th>
            <th className="px-3 py-3">{t.colDue}</th>
            <th className="px-3 py-3">{t.colStatus}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer hover:bg-zinc-50"
              onClick={() => onOpenOrder(row.id)}
            >
              <td className="px-3 py-3 font-medium">{row.orderNumber}</td>
              <td className="px-3 py-3">{row.clientName ?? "—"}</td>
              <td className="px-3 py-3 font-mono text-xs">{row.externalCode ?? "—"}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                {formatOrderAmount(row.debtAmount, row.currency)}
              </td>
              <td className="px-3 py-3 text-zinc-600">
                {row.paymentDueDate ? formatDate(row.paymentDueDate.slice(0, 10)) : "—"}
              </td>
              <td className="px-3 py-3">
                {row.financialStatus ? (
                  <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {financialStatusLabel(row.financialStatus)}
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
