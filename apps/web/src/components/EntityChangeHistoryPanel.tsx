"use client";

import { useCallback, useEffect, useState } from "react";
import { auditApi, type AuditEntityType } from "@/lib/api/resources/audit";
import { formatDateTime } from "@/lib/crmDatetime";
import { presentAuditEntry, type ChangeRow, type PresentedAudit } from "@/lib/changeHistoryDisplay";

const PREVIEW_ROWS = 6;

function ChangeValue({ row }: { row: ChangeRow }) {
  if (row.mode === "text") {
    return (
      <div className="mt-1 space-y-1.5 rounded-md bg-zinc-50 px-2.5 py-2 text-sm text-zinc-800">
        {row.before ? (
          <div>
            <div className="text-xs text-zinc-500">Було</div>
            <div className="whitespace-pre-wrap">{row.before}</div>
          </div>
        ) : null}
        {row.after ? (
          <div>
            <div className="text-xs text-zinc-500">Стало</div>
            <div className="whitespace-pre-wrap">{row.after}</div>
          </div>
        ) : null}
      </div>
    );
  }

  if (row.mode === "set" || row.mode === "added") {
    return <div className="text-sm text-zinc-800">{row.after}</div>;
  }

  if (row.mode === "removed") {
    return <div className="text-sm text-zinc-500 line-through">{row.before}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-800">
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
        {row.before || "не вказано"}
      </span>
      <span className="text-zinc-400">→</span>
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {row.after || "не вказано"}
      </span>
    </div>
  );
}

function HistoryCard({ entry }: { entry: PresentedAudit & { id: string; createdAt: string } }) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, entry.rows.length - PREVIEW_ROWS);
  const rows = open ? entry.rows : entry.rows.slice(0, PREVIEW_ROWS);
  const single = entry.rows.length === 1 ? entry.rows[0] : null;

  if (entry.technical) {
    return (
      <div className="flex items-center justify-between gap-3 px-1 py-1 text-sm text-zinc-500">
        <span>
          {entry.headline}
          {" · "}
          {entry.actor}
        </span>
        <time className="shrink-0 text-xs">{formatDateTime(entry.createdAt)}</time>
      </div>
    );
  }

  return (
    <article className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-900">{entry.headline}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{entry.actor}</div>
        </div>
        <time className="shrink-0 text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</time>
      </div>
      {single && entry.rows.length === 1 ? (
        <div className="mt-2">
          {single.label !== entry.headline ? (
            <div className="text-xs text-zinc-500">{single.label}</div>
          ) : null}
          <ChangeValue row={single} />
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={row.field}>
              {row.label !== entry.headline ? (
                <div className="text-xs text-zinc-500">{row.label}</div>
              ) : null}
              <ChangeValue row={row} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-zinc-600 hover:text-zinc-900"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Згорнути" : `Ще ${hidden}`}
        </button>
      ) : null}
    </article>
  );
}

export function EntityChangeHistoryPanel({
  entityType,
  entityId,
  pageSize = 20,
}: {
  entityType: AuditEntityType;
  entityId: string;
  pageSize?: number;
}) {
  const [items, setItems] = useState<Array<PresentedAudit & { id: string; createdAt: string }>>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await auditApi.listForEntity(entityType, entityId, { page, pageSize });
      setItems(
        (res.items ?? []).map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          ...presentAuditEntry(entry),
        })),
      );
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити історію змін");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && items.length === 0) {
    return <p className="text-sm text-zinc-500">Завантаження…</p>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Історія змін поки відсутня.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-2">
      {items.map((entry) => (
        <HistoryCard key={entry.id} entry={entry} />
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs text-zinc-600">
          <span>
            {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-40"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Назад
            </button>
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-40"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Далі
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
