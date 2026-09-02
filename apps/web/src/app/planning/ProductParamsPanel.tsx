"use client";

import { useCallback, useEffect, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type PlanningProductParamsRow,
} from "@/lib/api/resources/planning";

export function ProductParamsPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const [rows, setRows] = useState<PlanningProductParamsRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await planningApi.listProductParams({ q: q || undefined }));
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.saveSettings);
    } finally {
      setBusy(false);
    }
  }, [onError, q, t.errors.saveSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (row: PlanningProductParamsRow, patch: Partial<PlanningProductParamsRow>) => {
    setSavingId(row.productId);
    try {
      const next = await planningApi.patchProductParams(row.productId, {
        safetyStock: patch.safetyStock ?? row.safetyStock,
        productionLeadDays: patch.productionLeadDays ?? row.productionLeadDays,
        packLeadDays: patch.packLeadDays === undefined ? row.packLeadDays : patch.packLeadDays,
        isPlanned: patch.isPlanned ?? row.isPlanned,
        monthlyForecastOverride:
          patch.monthlyForecastOverride === undefined
            ? row.monthlyForecastOverride
            : patch.monthlyForecastOverride,
      });
      setRows((prev) =>
        prev.map((r) =>
          r.productId === next.productId
            ? {
                ...next,
                paretoClass: next.paretoClass ?? r.paretoClass,
                xyzClass: next.xyzClass ?? r.xyzClass,
                xyzReason: next.xyzReason ?? r.xyzReason,
                xyzSource: next.xyzSource ?? r.xyzSource,
                demandCv: next.demandCv ?? r.demandCv,
              }
            : r,
        ),
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.saveSettings);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">{t.productParams.hint}</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.kitBoard.search}
          className="w-56 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => void load()}
        >
          {t.actions.refresh}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {[
                t.labels.sku,
                t.labels.name,
                t.productParams.classCol,
                t.productParams.modeCol,
                t.productParams.overrideCol,
                t.labels.safetyStock,
                t.productParams.leadCol,
                t.productParams.plannedCol,
              ].map((h) => (
                <th key={h} className="px-2 py-2 text-left font-medium text-zinc-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-zinc-500">
                  {busy ? strings.common.loading : t.states.none}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.productId} className={savingId === row.productId ? "opacity-60" : ""}>
                  <td className="px-2 py-1.5 font-medium text-zinc-900">{row.sku}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 text-zinc-800">{row.name}</td>
                  <td className="px-2 py-1.5 text-zinc-700">
                    {row.paretoClass
                      ? t.kitBoard.classBadge(row.paretoClass, row.xyzClass)
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-700">{row.demandMode}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      className="w-20 rounded border border-zinc-200 px-1 py-0.5"
                      defaultValue={row.monthlyForecastOverride ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const next = raw === "" ? null : Number(raw);
                        if (next === row.monthlyForecastOverride) return;
                        if (next != null && !Number.isFinite(next)) return;
                        void save(row, { monthlyForecastOverride: next });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      className="w-16 rounded border border-zinc-200 px-1 py-0.5"
                      defaultValue={row.safetyStock}
                      onBlur={(e) => {
                        const next = Math.max(0, Math.round(Number(e.target.value) || 0));
                        if (next === row.safetyStock) return;
                        void save(row, { safetyStock: next });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      className="w-16 rounded border border-zinc-200 px-1 py-0.5"
                      defaultValue={row.productionLeadDays}
                      onBlur={(e) => {
                        const next = Math.max(1, Math.round(Number(e.target.value) || 90));
                        if (next === row.productionLeadDays) return;
                        void save(row, { productionLeadDays: next });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={row.isPlanned}
                      onChange={(e) => void save(row, { isPlanned: e.target.checked })}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
