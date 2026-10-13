"use client";

import { strings } from "@/locales";
import type { ReconciliationLine } from "@/lib/api/resources/receivables";
import { formatMoney } from "./format-money";
import { RECONCILE_STATUS_CLASS, reconcileStatusLabel } from "./receivables-labels";

export function ReconcileTable({
  rows,
  currency,
  canLinkContact,
  onOpenContact,
  onSearchCode,
  onLinkContact,
}: {
  rows: ReconciliationLine[];
  currency: string;
  canLinkContact: boolean;
  onOpenContact: (id: string) => void;
  onSearchCode: (code: string) => void;
  onLinkContact: (row: ReconciliationLine) => void;
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
            <th className="px-3 py-3">{t.colCode1C}</th>
            <th className="px-3 py-3">{t.colClient}</th>
            <th className="px-3 py-3 text-right">1С</th>
            <th className="px-3 py-3 text-right">CRM</th>
            <th className="px-3 py-3 text-right">Δ</th>
            <th className="px-3 py-3">{t.colStatus}</th>
            <th className="px-3 py-3">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-zinc-50">
              <td className="px-3 py-3 font-mono text-xs">{row.counterpartyCode1C || "—"}</td>
              <td className="px-3 py-3">{row.clientName ?? "—"}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                {row.amount1C > 0 ? formatMoney(row.amount1C, currency) : "—"}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {row.amountCRM > 0 ? formatMoney(row.amountCRM, currency) : "—"}
              </td>
              <td
                className={`px-3 py-3 text-right tabular-nums font-medium ${
                  Math.abs(row.delta) > 0.01 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {formatMoney(row.delta, currency)}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${RECONCILE_STATUS_CLASS[row.status]}`}
                >
                  {reconcileStatusLabel(row.status)}
                  {!row.counterpartyCode1C && row.status === "ONLY_CRM"
                    ? ` · ${t.reconcileStatusNoCode}`
                    : ""}
                </span>
              </td>
              <td className="px-3 py-3">
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
                    <>
                      <button
                        type="button"
                        onClick={() => onSearchCode(row.counterpartyCode1C)}
                        className="text-xs font-medium text-blue-600 underline"
                      >
                        {t.searchByCode}
                      </button>
                      {canLinkContact && !row.contactId ? (
                        <button
                          type="button"
                          onClick={() => onLinkContact(row)}
                          className="text-xs font-medium text-emerald-700 underline"
                        >
                          {t.linkToContact}
                        </button>
                      ) : null}
                    </>
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
