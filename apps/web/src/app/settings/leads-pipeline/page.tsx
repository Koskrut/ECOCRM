"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type LeadStatus = "NEW" | "IN_PROGRESS" | "WON" | "NOT_TARGET" | "LOST" | "SPAM";

type PipelineStage = {
  status: LeadStatus;
  sortOrder: number;
  label: string;
  color: string | null;
  visible: boolean;
  allowedNext: LeadStatus[];
};

const ALL_TARGETS: LeadStatus[] = ["NEW", "IN_PROGRESS", "WON", "NOT_TARGET", "LOST", "SPAM"];

function cloneStages(s: PipelineStage[]): PipelineStage[] {
  return s.map((r) => ({
    ...r,
    allowedNext: [...r.allowedNext],
  }));
}

export default function LeadsPipelineSettingsPage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PipelineStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<{ stages: PipelineStage[] }>("/leads/pipeline");
      const stages = res.data?.stages;
      if (!Array.isArray(stages) || stages.length !== 6) {
        setError("Не вдалося завантажити повний pipeline (очікується 6 статусів).");
        setRows(null);
        return;
      }
      setRows(
        cloneStages(
          stages.map((s) => ({
            status: s.status,
            sortOrder: s.sortOrder,
            label: s.label,
            color: s.color,
            visible: s.visible,
            allowedNext: s.allowedNext,
          })),
        ),
      );
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === "string" ? msg : "Не вдалося завантажити pipeline");
      setRows(null);
    } finally {
      setLoading(false);
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

  const updateRow = (status: LeadStatus, patch: Partial<PipelineStage>) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => (r.status === status ? { ...r, ...patch } : r));
    });
  };

  const toggleAllowed = (from: LeadStatus, to: LeadStatus) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => {
        if (r.status !== from) return r;
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
      await apiHttp.put("/leads/pipeline", { stages: rows });
      setOk("Збережено. Відкрийте лід знову або оновіть сторінку, щоб підтягнути конфіг у модалці.");
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
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">Leads pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Повна заміна конфігу одним збереженням. Порядок у списках — за{" "}
          <code className="text-xs">sortOrder</code> (0…5, без пропусків). Групування степпера (3 кроки) фіксоване в
          коді за <code className="text-xs">LeadStatus</code>, не редагується тут. Доменні правила переходів у коді
          лишаються сильнішими за дозволи тут.
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
              <div key={r.status} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <div className="text-xs font-medium text-zinc-500">LeadStatus</div>
                    <div className="font-mono text-sm font-semibold text-zinc-900">{r.status}</div>
                  </div>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">sortOrder</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.sortOrder}
                      onChange={(e) => updateRow(r.status, { sortOrder: Number(e.target.value) })}
                    />
                  </label>
                  <label className="min-w-[12rem] flex flex-1 flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">label</span>
                    <input
                      type="text"
                      className="rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.label}
                      onChange={(e) => updateRow(r.status, { label: e.target.value })}
                    />
                  </label>
                  <label className="flex min-w-[10rem] flex-col gap-0.5">
                    <span className="text-xs text-zinc-500">color (optional)</span>
                    <input
                      type="text"
                      className="rounded border border-zinc-200 px-2 py-1 text-sm"
                      value={r.color ?? ""}
                      placeholder="empty = default"
                      onChange={(e) => updateRow(r.status, { color: e.target.value.trim() || null })}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      checked={r.visible}
                      onChange={(e) => updateRow(r.status, { visible: e.target.checked })}
                    />
                    visible
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
                          onChange={() => toggleAllowed(r.status, t)}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
