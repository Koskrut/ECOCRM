"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { planningApi, type PackingList } from "@/lib/api/resources/planning";
import { strings } from "@/locales";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("uk-UA");
  } catch {
    return "—";
  }
}

function linePacked(line: NonNullable<PackingList["lines"]>[number]): number {
  return line.qtyPacked ?? 0;
}

export default function WarehousePackingPage() {
  const t = strings.warehousePacking;
  const [lists, setLists] = useState<PackingList[]>([]);
  const [active, setActive] = useState<PackingList | null>(null);
  const [packed, setPacked] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await planningApi.listPackingLists(40);
      const visible = all.filter((l) => l.status === "APPROVED" || l.status === "DONE");
      setLists(visible);
      // Prefer current approved, else first approved, else keep selection if still present.
      const current = await planningApi.getCurrentPackingList().catch(() => null);
      const preferred =
        current && (current.status === "APPROVED" || current.status === "DONE")
          ? current
          : visible.find((l) => l.status === "APPROVED") ?? visible[0] ?? null;
      if (preferred) {
        const full = await planningApi.getPackingList(preferred.id);
        setActive(full);
        setPacked(
          Object.fromEntries(
            (full.lines ?? []).map((l) => [l.kitProductId, String(linePacked(l))]),
          ),
        );
      } else {
        setActive(null);
        setPacked({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openList = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const full = await planningApi.getPackingList(id);
      setActive(full);
      setPacked(
        Object.fromEntries(
          (full.lines ?? []).map((l) => [l.kitProductId, String(linePacked(l))]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadError);
    } finally {
      setBusy(false);
    }
  };

  const lines = useMemo(
    () => (active?.lines ?? []).filter((l) => l.qtyApproved > 0),
    [active],
  );

  const totals = useMemo(() => {
    let plan = 0;
    let got = 0;
    for (const line of lines) {
      plan += line.qtyApproved;
      got += Math.max(0, Math.floor(Number(packed[line.kitProductId]) || 0));
    }
    return { plan, got };
  }, [lines, packed]);

  const editable = active?.status === "APPROVED" || active?.status === "DONE";

  const savePacked = async (nextLines: Array<{ kitProductId: string; qtyPacked: number }>) => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await planningApi.updatePackingPacked(active.id, nextLines);
      setActive(updated);
      setPacked(
        Object.fromEntries(
          (updated.lines ?? []).map((l) => [l.kitProductId, String(linePacked(l))]),
        ),
      );
      setToast(t.saved);
      const all = await planningApi.listPackingLists(40);
      setLists(all.filter((l) => l.status === "APPROVED" || l.status === "DONE"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    void savePacked(
      lines.map((l) => ({
        kitProductId: l.kitProductId,
        qtyPacked: Math.max(0, Math.floor(Number(packed[l.kitProductId]) || 0)),
      })),
    );
  };

  const onReceiveAll = () => {
    void savePacked(
      lines.map((l) => ({
        kitProductId: l.kitProductId,
        qtyPacked: l.qtyApproved,
      })),
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t.hint}</p>
      </div>

      {toast ? <p className="text-sm text-emerald-800">{toast}</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.empty}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t.backToLists}
            </p>
            <ul className="space-y-1">
              {lists.map((list) => {
                const selected = active?.id === list.id;
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openList(list.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        selected
                          ? "bg-zinc-900 text-white"
                          : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="block font-medium">
                        {formatDate(list.cycleStart)} – {formatDate(list.cycleEnd)}
                      </span>
                      <span
                        className={`mt-0.5 block text-xs ${
                          selected ? "text-zinc-300" : "text-zinc-500"
                        }`}
                      >
                        {list.status === "DONE" ? t.statusDone : t.statusApproved}
                        {list._count?.lines != null ? ` · ${list._count.lines}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {active ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    {formatDate(active.cycleStart)} – {formatDate(active.cycleEnd)}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    {active.status === "DONE" ? t.statusDone : t.statusApproved}
                    {" · "}
                    {t.progress(totals.got, totals.plan)}
                  </p>
                </div>
                {editable ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || lines.length === 0}
                      onClick={onSave}
                      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                    >
                      {t.save}
                    </button>
                    <button
                      type="button"
                      disabled={busy || lines.length === 0}
                      onClick={onReceiveAll}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 disabled:opacity-50"
                    >
                      {t.receiveAll}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t.colKit}</th>
                      <th className="px-3 py-2 font-medium">{t.colPlan}</th>
                      <th className="px-3 py-2 font-medium">{t.colPacked}</th>
                      <th className="px-3 py-2 font-medium">{t.colDue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const done = (Number(packed[line.kitProductId]) || 0) >= line.qtyApproved;
                      return (
                        <tr
                          key={line.id}
                          className={`border-t border-zinc-100 ${done ? "bg-emerald-50/60" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <span className="block font-medium text-zinc-900">
                              {line.kitProduct.sku}
                            </span>
                            <span className="block text-xs text-zinc-500">
                              {line.kitProduct.name}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{line.qtyApproved}</td>
                          <td className="px-3 py-2">
                            {editable ? (
                              <input
                                type="number"
                                min={0}
                                step={1}
                                disabled={busy}
                                value={packed[line.kitProductId] ?? "0"}
                                onChange={(e) =>
                                  setPacked((prev) => ({
                                    ...prev,
                                    [line.kitProductId]: e.target.value,
                                  }))
                                }
                                className="w-24 rounded-lg border border-zinc-200 px-2 py-1 tabular-nums"
                              />
                            ) : (
                              <span className="tabular-nums">{linePacked(line)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-zinc-600">
                            {formatDate(line.dueAt ?? active.cycleEnd)}
                          </td>
                        </tr>
                      );
                    })}
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                          {t.empty}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
