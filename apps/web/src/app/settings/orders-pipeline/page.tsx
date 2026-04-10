"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type OrderStage =
  | "NEW"
  | "CONFIRMED"
  | "AWAITING_PAYMENT"
  | "AWAITING_STOCK"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "AWAITING_RECEIPT"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELED"
  | "REFUSED"
  | "RETURN_IN_PROGRESS";

type KanbanGroup = "MAIN" | "FINAL";

type PipelineStage = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: KanbanGroup;
  allowedNext: OrderStage[];
};

type PipelineHistoryItem = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  summary: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
};

const ALL_TARGETS: OrderStage[] = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
];

function cloneStages(s: PipelineStage[]): PipelineStage[] {
  return s.map((r) => ({
    ...r,
    allowedNext: [...r.allowedNext],
  }));
}

export default function OrdersPipelineSettingsPage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PipelineStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [history, setHistory] = useState<PipelineHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setHistoryLoading(true);
    setError(null);
    try {
      const [pipelineRes, historyRes] = await Promise.all([
        apiHttp.get<{ stages: PipelineStage[] }>("/orders/pipeline"),
        apiHttp.get<{ items: PipelineHistoryItem[] }>("/orders/pipeline/history"),
      ]);
      const res = pipelineRes;
      const stages = res.data?.stages;
      if (!Array.isArray(stages) || stages.length < 12) {
        setError("Не вдалося завантажити повний pipeline (очікується 12 стадій).");
        setRows(null);
        return;
      }
      setRows(cloneStages(stages));
      setHistory(Array.isArray(historyRes.data?.items) ? historyRes.data.items : []);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === "string" ? msg : "Не вдалося завантажити pipeline");
      setRows(null);
      setHistory([]);
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void load();
  }, [role, load]);

  const updateRow = (stage: OrderStage, patch: Partial<PipelineStage>) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => (r.stage === stage ? { ...r, ...patch } : r));
    });
  };

  const toggleAllowed = (from: OrderStage, to: OrderStage) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => {
        if (r.stage !== from) return r;
        const has = r.allowedNext.includes(to);
        const allowedNext = has ? r.allowedNext.filter((x) => x !== to) : [...r.allowedNext, to];
        return { ...r, allowedNext };
      });
    });
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await apiHttp.put("/orders/pipeline", { stages: rows });
      setOk("Збережено. Оновіть сторінку замовлень, щоб канбан підтягнув новий конфіг.");
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === "string" ? msg : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  if (role === undefined) {
    return <div className="p-6 text-sm text-zinc-500">Завантаження…</div>;
  }
  if (role !== "ADMIN") {
    return <div className="p-6 text-sm text-zinc-600">Доступ лише для ADMIN.</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Settings
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">Orders pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Повна заміна конфігу одним збереженням. Порядок колонок канбану — за <code className="text-xs">sortOrder</code>{" "}
          (0…11, без пропусків). Доменні правила переходів у коді лишаються сильнішими за дозволи тут.
        </p>

        {loading ? <div className="mt-6 text-sm text-zinc-500">Завантаження…</div> : null}
        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        ) : null}
        {ok ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {ok}
          </div>
        ) : null}

        {!loading && rows ? (
          <div className="mt-6 space-y-6">
            {sortedRows.map((r) => (
              <div key={r.stage} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <div className="text-xs font-medium text-zinc-500">Stage</div>
                    <div className="font-mono text-sm font-semibold text-zinc-900">{r.stage}</div>
                  </div>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">sortOrder</span>
                    <input
                      type="number"
                      min={0}
                      max={11}
                      className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.sortOrder}
                      onChange={(e) => updateRow(r.stage, { sortOrder: Number(e.target.value) })}
                    />
                  </label>
                  <label className="min-w-[12rem] flex flex-1 flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">label</span>
                    <input
                      type="text"
                      className="rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.label}
                      onChange={(e) => updateRow(r.stage, { label: e.target.value })}
                    />
                  </label>
                  <label className="flex min-w-[10rem] flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">color (Tailwind, optional)</span>
                    <input
                      type="text"
                      className="rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.color ?? ""}
                      placeholder="empty = default"
                      onChange={(e) => updateRow(r.stage, { color: e.target.value.trim() || null })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">kanbanGroup</span>
                    <select
                      className="rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.kanbanGroup}
                      onChange={(e) => updateRow(r.stage, { kanbanGroup: e.target.value as KanbanGroup })}
                    >
                      <option value="MAIN">MAIN</option>
                      <option value="FINAL">FINAL</option>
                    </select>
                  </label>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700">allowedNext</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ALL_TARGETS.map((t) => (
                      <label key={t} className="inline-flex items-center gap-1 text-xs text-zinc-700">
                        <input
                          type="checkbox"
                          checked={r.allowedNext.includes(t)}
                          onChange={() => toggleAllowed(r.stage, t)}
                        />
                        <span className="font-mono">{t}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Збереження…" : "Зберегти pipeline"}
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                disabled={saving}
                onClick={() => void load()}
              >
                Скинути з сервера
              </button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">History (read-only)</h2>
              <p className="mt-1 text-xs text-zinc-500">Останні зміни pipeline config (ADMIN).</p>
              {historyLoading ? <div className="mt-3 text-sm text-zinc-500">Завантаження історії…</div> : null}
              {!historyLoading && history.length === 0 ? (
                <div className="mt-3 text-sm text-zinc-500">Історія порожня.</div>
              ) : null}
              {!historyLoading && history.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {history.map((h) => (
                    <details key={h.id} className="rounded border border-zinc-200 p-3">
                      <summary className="cursor-pointer text-sm text-zinc-800">
                        {new Date(h.createdAt).toLocaleString()} • {h.actorEmail ?? h.actorUserId ?? "unknown"} •{" "}
                        {h.summary ?? "Updated pipeline"}
                      </summary>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs font-medium text-zinc-500">beforeSnapshot</div>
                          <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-700">
                            {JSON.stringify(h.beforeSnapshot, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-zinc-500">afterSnapshot</div>
                          <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-700">
                            {JSON.stringify(h.afterSnapshot, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
