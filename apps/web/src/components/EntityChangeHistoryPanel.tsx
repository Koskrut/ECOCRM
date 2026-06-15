"use client";

import { useCallback, useEffect, useState } from "react";
import { auditApi, type AuditEntityType, type AuditLogItem } from "@/lib/api/resources/audit";
import { formatDateTime } from "@/lib/crmDatetime";

const FIELD_LABELS: Record<string, string> = {
  name: "Назва",
  edrpou: "ЄДРПОУ",
  taxId: "ІПН",
  phone: "Телефон",
  address: "Адрес",
  lat: "Широта",
  lng: "Долгота",
  googlePlaceId: "Google Place",
  ownerId: "Відповідальний",
  orderStage: "Етап",
  status: "Статус",
};

function formatActor(changedBy: string): string {
  if (changedBy.startsWith("integration:")) {
    return changedBy.replace("integration:", "").replace(/-/g, " ");
  }
  if (changedBy.startsWith("cron:")) {
    return changedBy.replace("cron:", "").replace(/-/g, " ");
  }
  if (changedBy === "system") return "Система";
  return changedBy;
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function diffEntries(item: AuditLogItem): { field: string; before: unknown; after: unknown }[] {
  if (Array.isArray(item.diff) && item.diff.length > 0) {
    return item.diff;
  }
  if (item.action === "CREATE" && item.after && typeof item.after === "object") {
    return Object.entries(item.after as Record<string, unknown>)
      .filter(([key]) => !["createdAt", "updatedAt"].includes(key))
      .slice(0, 20)
      .map(([field, after]) => ({ field, before: null, after }));
  }
  return [];
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
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await auditApi.listForEntity(entityType, entityId, { page, pageSize });
      setItems(res.items ?? []);
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
    <div className="space-y-3">
      {items.map((entry) => {
        const changes = diffEntries(entry);
        const isExpanded = expandedId === entry.id;
        return (
          <div key={entry.id} className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left text-zinc-700"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
            >
              <span>
                <span className="font-medium">{entry.action}</span>
                {" · "}
                {formatActor(entry.changedBy)}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</span>
            </button>
            {isExpanded && changes.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-zinc-700">
                {changes.map((p, i) => (
                  <li key={i}>
                    {fieldLabel(p.field)}: {formatValue(p.before)} → {formatValue(p.after)}
                  </li>
                ))}
              </ul>
            )}
            {isExpanded && changes.length === 0 && (
              <p className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                Деталі змін недоступні для цієї події.
              </p>
            )}
          </div>
        );
      })}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-600">
          <span>
            Сторінка {page} з {totalPages} ({total} записів)
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
