"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import {
  oneCPaymentsApi,
  type OneCCommitResponse,
  type OneCMatchStatus,
  type OneCPreviewRow,
} from "@/lib/api/resources/one-c-payments";
import { formatDate } from "@/lib/crmDatetime";
import { formatOrderAmount } from "@/lib/formatOrderAmount";

const STATUS_LABEL: Record<OneCMatchStatus, string> = {
  MATCHED: "Знайдено",
  AMBIGUOUS: "Кілька варіантів",
  UNMATCHED: "Не знайдено",
  ALREADY_IMPORTED: "Вже імпортовано",
  CONTACT_MISMATCH: "Інший контрагент",
  CONTACT_NOT_FOUND: "Контакт не знайдено",
};

const STATUS_CLASS: Record<OneCMatchStatus, string> = {
  MATCHED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  AMBIGUOUS: "bg-amber-50 text-amber-900 ring-amber-200",
  UNMATCHED: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  ALREADY_IMPORTED: "bg-sky-50 text-sky-800 ring-sky-200",
  CONTACT_MISMATCH: "bg-orange-50 text-orange-900 ring-orange-200",
  CONTACT_NOT_FOUND: "bg-red-50 text-red-800 ring-red-200",
};

export default function OneCPaymentsImportPage() {
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<OneCPreviewRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [commitResult, setCommitResult] = useState<OneCCommitResponse | null>(null);
  

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const canWrite = role === "ADMIN" || role === "LEAD";

  const applySummary = useCallback(
    (summary: { counts: Record<string, number>; rows: OneCPreviewRow[] }) => {
      setCounts(summary.counts ?? {});
      setRows(summary.rows ?? []);
      const next: Record<string, string> = {};
      for (const r of summary.rows ?? []) {
        if (r.overrideOrderId) next[r.importKey] = r.overrideOrderId;
      }
      setOverrides(next);
    },
    [],
  );

  const onUpload = async (file: File | null) => {
    if (!file || !canWrite) return;
    setBusy(true);
    setErr(null);
    setCommitResult(null);
    try {
      const res = await oneCPaymentsApi.upload(file);
      setJobId(res.jobId);
      setFileName(res.fileName);
      applySummary(res.summary);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const createContact = async (r: OneCPreviewRow) => {
    if (!jobId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await oneCPaymentsApi.createContact(jobId, r.enterpriseCode, r.enterpriseName);
      if (res.data.contactId) {
        const revalRes = await oneCPaymentsApi.revalidate(jobId);
        applySummary(revalRes.data.summary);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не вдалося створити контакт");
    } finally {
      setBusy(false);
    }
  };

  const setOverride = async (importKey: string, orderId: string) => {
    if (!jobId) return;
    const next = { ...overrides, [importKey]: orderId };
    if (!orderId) delete next[importKey];
    setOverrides(next);
    setBusy(true);
    setErr(null);
    try {
      const r = await oneCPaymentsApi.setOverrides(jobId, { [importKey]: orderId });
      applySummary(r.data.summary);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save override");
    } finally {
      setBusy(false);
    }
  };

  const onCommit = async () => {
    if (!jobId || !canWrite) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await oneCPaymentsApi.commit(jobId, overrides);
      setCommitResult(r.data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const readyCount = useMemo(() => {
    return rows.filter((r) => {
      if (r.status === "ALREADY_IMPORTED") return false;
      return Boolean(overrides[r.importKey] || r.order?.orderId || r.contactOrders.length > 1);
    }).length;
  }, [rows, overrides]);

  if (role && role !== "ADMIN" && role !== "LEAD" && role !== "MANAGER") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Недостатньо прав для перегляду імпорту оплат 1С.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-7xl">
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Налаштування
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Імпорт оплат з 1С</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Завантажте вивантаження <code className="font-mono">.xlsb</code> /{" "}
          <code className="font-mono">.xlsx</code>, перевірте зіставлення з замовленнями та
          створіть платежі в CRM.
        </p>

        {canWrite && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
            <label className="block text-sm font-medium text-zinc-800">Файл 1С</label>
            <input
              type="file"
              accept=".xlsb,.xlsx,.xls"
              disabled={busy}
              className="mt-2 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            {fileName && (
              <p className="mt-2 text-xs text-zinc-500">
                Файл: {fileName}
                {jobId ? ` · job ${jobId.slice(0, 8)}…` : ""}
              </p>
            )}
          </div>
        )}

        {err && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </div>
        )}

        {commitResult && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Імпорт завершено: створено {commitResult.created}, пропущено {commitResult.skipped}
            {commitResult.errors.length > 0
              ? `, помилок ${commitResult.errors.length}`
              : ""}
            .
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-200">
                Всього: {counts.total ?? rows.length}
              </span>
              {(
                [
                  "MATCHED",
                  "CONTACT_MISMATCH",
                  "AMBIGUOUS",
                  "UNMATCHED",
                  "ALREADY_IMPORTED",
                  "CONTACT_NOT_FOUND",
                ] as OneCMatchStatus[]
              ).map((s) =>
                counts[s] ? (
                  <span
                    key={s}
                    className={`rounded-full px-3 py-1 ring-1 ${STATUS_CLASS[s]}`}
                  >
                    {STATUS_LABEL[s]}: {counts[s]}
                  </span>
                ) : null,
              )}
              <span className="ml-auto text-zinc-600">До commit: {readyCount}</span>
              {canWrite && (
                <button
                  type="button"
                  disabled={busy || readyCount === 0 || Boolean(commitResult)}
                  onClick={() => void onCommit()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Створити платежі
                </button>
              )}
            </div>

            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Дата</th>
                    <th className="px-3 py-2">№ 1С</th>
                    <th className="px-3 py-2">Контрагент</th>
                    <th className="px-3 py-2">Сума</th>
                    <th className="px-3 py-2">Статус</th>
                    <th className="px-3 py-2">Замовлення</th>
                    <th className="px-3 py-2">Борг</th>
                    <th className="px-3 py-2">Примітки / вибір</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const selectedId = overrides[r.importKey] || r.order?.orderId || "";
                    return (
                      <tr key={r.importKey} className="border-t border-zinc-100 align-top">
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                          {formatDate(r.paidAt)}
                          {r.isNovaPay && (
                            <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              NovaPay
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-800">
                          {r.documentNumber}
                          {r.matchedRef && r.matchedRef !== r.documentNumber && (
                            <div className="text-[10px] text-zinc-500">ref {r.matchedRef}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-zinc-900">{r.enterpriseName}</div>
                          <div className="text-xs text-zinc-500">код {r.enterpriseCode}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatOrderAmount(r.amountLv, r.currency)}
                          {r.amountOv != null && (
                            <div className="text-xs text-zinc-500">${r.amountOv}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_CLASS[r.status]}`}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.order ? (
                            <div>
                              <Link
                                href={`/orders/${r.order.orderId}`}
                                className="font-medium text-sky-700 hover:underline"
                              >
                                #{r.order.orderNumber}
                              </Link>
                              {r.order.invoiceNumber && (
                                <div className="text-[10px] text-zinc-500">
                                  рах. {r.order.invoiceNumber}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                          {r.order
                            ? formatOrderAmount(r.order.debtAmount, r.order.currency)
                            : "—"}
                          {r.amountDebtDelta != null && Math.abs(r.amountDebtDelta) > 1 && (
                            <div className="text-[10px] text-amber-700">
                              Δ {r.amountDebtDelta.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="min-w-[220px] px-3 py-2">
                          {r.purpose && (
                            <p className="mb-1 line-clamp-2 text-xs text-zinc-500" title={r.purpose}>
                              {r.purpose}
                            </p>
                          )}
                          {r.warnings.length > 0 && (
                            <ul className="mb-1 list-disc pl-4 text-[11px] text-amber-800">
                              {r.warnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          )}
                          {r.status === "CONTACT_NOT_FOUND" && canWrite && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void createContact(r)}
                              className="mt-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Створити контакт «{r.enterpriseName}»
                            </button>
                          )}
                          {r.status !== "ALREADY_IMPORTED" && r.status !== "CONTACT_NOT_FOUND" && canWrite && r.contactOrders.length > 0 && (
                            <div className="space-y-1">
                              <select
                                className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                                value={selectedId}
                                onChange={(e) => void setOverride(r.importKey, e.target.value)}
                              >
                                <option value="">Оберіть замовлення…</option>
                                {r.contactOrders.map((c) => (
                                  <option key={c.orderId} value={c.orderId}>
                                    #{c.orderNumber} · борг {formatOrderAmount(c.debtAmount, c.currency)}
                                  </option>
                                ))}
                              </select>
                              {selectedId && overrides[r.importKey] && (
                                <p className="text-[10px] text-emerald-700">Обрано вручну</p>
                              )}
                            </div>
                          )}
                          {r.status !== "ALREADY_IMPORTED" && r.status !== "CONTACT_NOT_FOUND" && r.contactOrders.length === 0 && !r.order && (
                            <p className="text-[10px] text-zinc-500">У клієнта немає замовлень з боргом</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
