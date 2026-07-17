"use client";

import { Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CallRecordingPlayer } from "@/components/calls/CallRecordingPlayer";
import { formatDateTime } from "@/lib/crmDatetime";
import { callsApi, type CallsHistoryItem } from "@/lib/api/resources/calls";

type Props = {
  contactId?: string | null;
  leadId?: string | null;
  companyId?: string | null;
  /** Max recordings to show (default 8). */
  limit?: number;
  className?: string;
};

function directionLabel(direction: string | null): string {
  const d = (direction ?? "").toUpperCase();
  if (d === "INBOUND") return "Входящий";
  if (d === "OUTBOUND") return "Исходящий";
  return "Звонок";
}

function formatDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function hasPlayableRecording(item: CallsHistoryItem): boolean {
  if (!item.recordingUrl?.trim()) return false;
  const status = (item.recordingStatus ?? "").trim().toUpperCase();
  return !status || status === "READY";
}

export function EntityCallRecordingsPanel({
  contactId,
  leadId,
  companyId,
  limit = 8,
  className = "",
}: Props) {
  const [items, setItems] = useState<CallsHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cId = contactId?.trim() || undefined;
    const lId = leadId?.trim() || undefined;
    const coId = companyId?.trim() || undefined;
    if (!cId && !lId && !coId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await callsApi.listHistory({
        page: 1,
        pageSize: Math.min(50, Math.max(limit * 2, 16)),
        recording: "yes",
        contactId: cId,
        leadId: lId,
        companyId: coId,
      });
      setItems(res.items.filter(hasPlayableRecording).slice(0, limit));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити записи");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, contactId, leadId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!contactId?.trim() && !leadId?.trim() && !companyId?.trim()) {
    return null;
  }

  return (
    <div className={`rounded-lg border border-zinc-200 bg-white ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Phone className="h-4 w-4 text-emerald-600" aria-hidden />
          Записи розмов
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          Оновити
        </button>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="text-sm text-zinc-500">Завантаження…</div>
        ) : error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">Немає доступних записів розмов</div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const when = item.startedAt || item.sortAt;
              const durationText = formatDuration(item.talkSec ?? item.durationSec);
              const subtitle = [
                item.fromDisplay && item.toDisplay
                  ? `${item.fromDisplay} → ${item.toDisplay}`
                  : item.fromDisplay || item.toDisplay,
                when ? formatDateTime(when) : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <li key={item.id} className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900">
                      {directionLabel(item.direction)}
                    </span>
                    {durationText ? (
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600">
                        {durationText}
                      </span>
                    ) : null}
                    {when ? (
                      <span className="text-[11px] text-zinc-500">{formatDateTime(when)}</span>
                    ) : null}
                  </div>
                  <CallRecordingPlayer
                    url={item.recordingUrl}
                    status={item.recordingStatus ?? "READY"}
                    durationSec={item.talkSec ?? item.durationSec}
                    sessionId={`entity-rec:${item.id}`}
                    title={directionLabel(item.direction)}
                    subtitle={subtitle}
                    variant="compact"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
