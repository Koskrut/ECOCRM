"use client";

import { useCallback, useEffect, useRef } from "react";

export type FiltersBarProps = {
  dateFrom: string;
  dateTo: string;
  compare: boolean;
  onChange: (next: { dateFrom: string; dateTo: string; compare: boolean }) => void;
  showManagerFilter?: boolean;
  managerId?: string;
  managers?: Array<{ id: string; fullName: string } | null>;
  onManagerChange?: (id: string) => void;
};

export function FiltersBar({
  dateFrom,
  dateTo,
  compare,
  onChange,
  showManagerFilter,
  managerId,
  managers,
  onManagerChange,
}: FiltersBarProps) {
  const safeManagers = (managers ?? []).filter(
    (m): m is { id: string; fullName: string } =>
      Boolean(m) && typeof (m as { id?: unknown }).id === "string",
  );
  const dropped = (managers?.length ?? 0) - safeManagers.length;
  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-managers-2",
        hypothesisId: "H16",
        location: "FiltersBar.tsx:mounted",
        message: "FiltersBar mounted (debug version)",
        data: { original: managers?.length ?? 0, safe: safeManagers.length, dropped, showManagerFilter: Boolean(showManagerFilter) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [dropped, managers?.length, safeManagers.length, showManagerFilter]);
  const setPreset = useCallback(
    (preset: "week" | "month") => {
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      const from = new Date(to);
      const days = preset === "week" ? 6 : 29;
      from.setDate(from.getDate() - days);
      from.setHours(0, 0, 0, 0);
      onChange({
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
        compare,
      });
    },
    [compare, onChange],
  );

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500">Від</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value, dateTo, compare })}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500">До</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onChange({ dateFrom, dateTo: e.target.value, compare })}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPreset("week")}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          7 днів
        </button>
        <button
          type="button"
          onClick={() => setPreset("month")}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          30 днів
        </button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={compare}
          onChange={(e) => onChange({ dateFrom, dateTo, compare: e.target.checked })}
        />
        Порівняти з попереднім періодом
      </label>
      {showManagerFilter && managers && onManagerChange && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Менеджер</label>
          <select
            value={managerId ?? ""}
            onChange={(e) => onManagerChange(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          >
            <option value="">Усі</option>
            {safeManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
