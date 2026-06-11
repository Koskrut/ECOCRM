"use client";

import type { FieldShiftTeamItem } from "@/lib/api/resources/field-shifts";

const STALE_MS = 10 * 60 * 1000;

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "немає сигналу";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "щойно";
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min} хв тому`;
  const h = Math.round(min / 60);
  return `${h} год тому`;
}

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > STALE_MS;
}

type TeamFieldListProps = {
  items: FieldShiftTeamItem[];
  selectedOwnerId: string | null;
  onSelect: (ownerId: string) => void;
};

export function TeamFieldList({ items, selectedOwnerId, onSelect }: TeamFieldListProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
        Немає активних змін у команді
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const selected = item.owner.id === selectedOwnerId;
        const stale = isStale(item.lastSample?.clientRecordedAt);
        return (
          <li key={item.shift.id}>
            <button
              type="button"
              onClick={() => onSelect(item.owner.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                selected
                  ? "border-blue-400 bg-blue-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">{item.owner.fullName}</p>
                  <p className="text-xs text-zinc-500">{item.owner.email}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  На зміні
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                {item.currentVisit ? (
                  <p>
                    Візит: <span className="font-medium">{item.currentVisit.title ?? "—"}</span> (
                    {item.currentVisit.status})
                  </p>
                ) : (
                  <p className="text-zinc-400">Поточний візит не вибрано</p>
                )}
                <p>
                  GPS: {formatAgo(item.lastSample?.clientRecordedAt)}
                  {item.sampleCountToday > 0 ? ` · ${item.sampleCountToday} точок` : ""}
                </p>
                {stale ? (
                  <p className="font-medium text-amber-700">Сигнал застарів — перевірте телефон</p>
                ) : null}
                {!item.shift.trackingEnabled ? (
                  <p className="text-zinc-500">Трек вимкнено на зміні</p>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
