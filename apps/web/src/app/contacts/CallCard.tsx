"use client";

type CallMeta = {
  direction?: string;
  status?: string;
  durationSec?: number;
  recordingStatus?: string;
  recordingUrl?: string;
  from?: string;
  to?: string;
  startedAt?: string;
};

export type CallTimelineItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  call?: CallMeta;
};

type Props = {
  item: CallTimelineItem;
  /** When set, body is expandable/collapsible like in ContactTimeline COMMENT/MEETING cards */
  isExpanded?: boolean;
  onToggle?: () => void;
};

function formatDuration(sec?: number): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function directionLabel(direction?: string): { label: string; variant: "in" | "out" | "unknown" } {
  const d = (direction ?? "").toUpperCase();
  if (d === "INBOUND") return { label: "Входящий", variant: "in" };
  if (d === "OUTBOUND") return { label: "Исходящий", variant: "out" };
  return { label: "Звонок", variant: "unknown" };
}

function statusLabel(status?: string): { label: string; variant: "ok" | "missed" | "other" } {
  const s = (status ?? "").toUpperCase();
  if (!s) return { label: "Неизвестно", variant: "other" };
  if (s.includes("MISSED") || s === "NOANSWER" || s.includes("NO_ANSWER"))
    return { label: "Пропущен", variant: "missed" };
  if (s.includes("ANSWER") || s === "ANSWERED") return { label: "Отвечен", variant: "ok" };
  if (s === "BUSY") return { label: "Занято", variant: "other" };
  if (s === "FAILED") return { label: "Ошибка", variant: "other" };
  return { label: s, variant: "other" };
}

function recordingLabel(status?: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "READY") return "Готова";
  if (s === "PENDING") return "Обрабатывается";
  if (s === "FAILED") return "Ошибка";
  if (!s) return "Нет записи";
  return s;
}

export function CallCard({ item, isExpanded = false, onToggle }: Props) {
  const call = item.call ?? {};
  const dir = directionLabel(call.direction);
  const st = statusLabel(call.status);
  const durationText = formatDuration(call.durationSec);
  const occurredAt = new Date(item.occurredAt).toLocaleString();
  const canPlay =
    !!call.recordingUrl && (call.recordingStatus ?? "").toUpperCase() === "READY";

  const fromLabel = (call.from ?? "").trim();
  const toLabel = (call.to ?? "").trim();
  const showSingleNumber =
    fromLabel && (!toLabel || fromLabel === toLabel);

  const hasBody = item.body.trim().length > 0;
  const canExpand = hasBody && onToggle;

  return (
    <div className="rounded-md border border-zinc-200 p-3 bg-zinc-50">
      <div className="flex items-start justify-between gap-3">
        <div
          className="min-w-0 flex-1 space-y-1"
          role={canExpand ? "button" : undefined}
          tabIndex={canExpand ? 0 : undefined}
          onClick={canExpand ? onToggle : undefined}
          onKeyDown={
            canExpand
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle?.();
                  }
                }
              : undefined
          }
          className={
            canExpand
              ? "min-w-0 flex-1 space-y-1 cursor-pointer hover:bg-zinc-100/80 rounded focus:outline-none focus:ring-2 focus:ring-zinc-300 -m-1 p-1"
              : "min-w-0 flex-1 space-y-1"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">
              {item.title || "Звонок"}
            </span>
            <span
              className={
                dir.variant === "in"
                  ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200"
                  : dir.variant === "out"
                    ? "rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-200"
                    : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200"
              }
            >
              {dir.label}
            </span>
            <span
              className={
                st.variant === "missed"
                  ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200"
                  : st.variant === "ok"
                    ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200"
                    : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200"
              }
            >
              {st.label}
            </span>
            {durationText && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                {durationText}
              </span>
            )}
            {hasBody && onToggle && (
              <span className="text-xs text-zinc-500">
                {isExpanded ? "▼ свернуть" : "▶ результат и комментарии"}
              </span>
            )}
          </div>

          {(fromLabel || toLabel) && (
            <div className="text-xs text-zinc-600">
              {showSingleNumber ? (
                <span className="font-mono">{fromLabel || toLabel}</span>
              ) : (
                <>
                  {fromLabel && <span className="font-mono">{fromLabel}</span>}
                  {fromLabel && toLabel && <span className="mx-1 text-zinc-400">→</span>}
                  {toLabel && <span className="font-mono">{toLabel}</span>}
                </>
              )}
            </div>
          )}

          {hasBody && isExpanded && (
            <div className="mt-2 rounded bg-zinc-50 p-2 whitespace-pre-wrap text-sm text-zinc-700 border border-zinc-100">
              {item.body}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{occurredAt}</span>
            <span>·</span>
            <span>by {item.createdByName ?? item.createdBy}</span>
          </div>
        </div>

        <div className="flex w-40 flex-col items-end gap-2">
          <span className="text-xs text-zinc-500">
            Запись: {recordingLabel(call.recordingStatus)}
          </span>
          {canPlay ? (
            <audio
              controls
              className="w-full rounded-md border border-zinc-200 bg-white"
              src={call.recordingUrl}
            />
          ) : (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-md border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500"
            >
              Нет доступной записи
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

