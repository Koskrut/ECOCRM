"use client";

import { Pencil, Phone, Trash2 } from "lucide-react";
import { CallRecordingPlayer } from "@/components/calls/CallRecordingPlayer";
import { formatDateTime } from "@/lib/crmDatetime";

type CallMeta = {
  direction?: string;
  status?: string;
  durationSec?: number;
  talkSec?: number;
  waitingSec?: number;
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
  pinnedAt?: string | null;
  call?: CallMeta;
};

type Props = {
  item: CallTimelineItem;
  /** When set, body is expandable/collapsible like in ContactTimeline COMMENT/MEETING cards */
  isExpanded?: boolean;
  onToggle?: () => void;
  /** When set, show Edit button and call on edit click */
  onEdit?: () => void;
  /** When set, show Delete button and call on delete click */
  onDelete?: () => void;
  /** When true, show "Видалити? Так / Ні" confirm */
  showDeleteConfirm?: boolean;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  actionLoading?: boolean;
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

function statusLabel(
  status: string | undefined,
  direction: string | undefined,
): { label: string; variant: "ok" | "missed" | "other" } {
  const s = (status ?? "").toUpperCase();
  const d = (direction ?? "").toUpperCase();
  if (!s) return { label: "Неизвестно", variant: "other" };
  if (s.includes("MISSED") || s === "NOANSWER" || s.includes("NO_ANSWER"))
    return { label: d === "OUTBOUND" ? "Не дозвонился" : "Пропущен", variant: "missed" };
  if (s.includes("ANSWER") || s === "ANSWERED") return { label: "Отвечен", variant: "ok" };
  if (s === "BUSY") return { label: "Занято", variant: "other" };
  if (s === "FAILED") return { label: "Ошибка", variant: "other" };
  return { label: s, variant: "other" };
}

export function CallCard({
  item,
  isExpanded = false,
  onToggle,
  onEdit,
  onDelete,
  showDeleteConfirm = false,
  onConfirmDelete,
  onCancelDelete,
  actionLoading = false,
}: Props) {
  const call = item.call ?? {};
  const dir = directionLabel(call.direction);
  const st = statusLabel(call.status, call.direction);
  const durationText = formatDuration(call.durationSec);
  const talkText = formatDuration(call.talkSec);
  const waitText = formatDuration(call.waitingSec);
  const occurredAt = formatDateTime(item.occurredAt);

  const rawFrom = (call.from ?? "").trim();
  const rawTo = (call.to ?? "").trim();
  const isOutbound = (call.direction ?? "").toUpperCase() === "OUTBOUND";
  // DB stores from=customer and to=manager/line for consistent matching; UI should show real flow.
  const fromLabel = (isOutbound ? rawTo : rawFrom).trim();
  const toLabel = (isOutbound ? rawFrom : rawTo).trim();
  const showSingleNumber =
    fromLabel && (!toLabel || fromLabel === toLabel);

  const hasBody = item.body.trim().length > 0;
  const canExpand = hasBody && onToggle && !showDeleteConfirm;
  const hasActions = onEdit != null || onDelete != null;

  const hasRecording =
    !!call.recordingUrl &&
    (!(call.recordingStatus ?? "").trim() ||
      (call.recordingStatus ?? "").toUpperCase() === "READY");
  const showRecordingUi =
    !!call.recordingUrl ||
    ["PENDING", "FAILED", "READY"].includes((call.recordingStatus ?? "").toUpperCase());

  const recordingSubtitle = [
    showSingleNumber ? fromLabel || toLabel : [fromLabel, toLabel].filter(Boolean).join(" → "),
    occurredAt,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-center pt-0.5">
          <Phone className="h-5 w-5 text-emerald-600" aria-hidden />
        </div>
        <div
          className={
            canExpand
              ? "min-w-0 flex-1 space-y-2 cursor-pointer hover:bg-zinc-100/80 rounded focus:outline-none focus:ring-2 focus:ring-zinc-300 -m-1 p-1"
              : "min-w-0 flex-1 space-y-2"
          }
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
            {talkText && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                разговор {talkText}
              </span>
            )}
            {waitText && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                ожидание {waitText}
              </span>
            )}
            {hasRecording && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                С записью
              </span>
            )}
            {hasBody && onToggle && !showDeleteConfirm && (
              <span className="text-xs text-zinc-500">
                {isExpanded ? "▼ свернуть" : "▶ результат и комментарии"}
              </span>
            )}
            {hasActions && !showDeleteConfirm && (
              <span className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={onEdit}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    title="Редагувати"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={onDelete}
                    className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    title="Видалити"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
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

          {hasBody && !showDeleteConfirm && (
            <div
              className={`overflow-hidden transition-all duration-200 ease-out ${
                isExpanded ? "mt-2 opacity-100" : "max-h-0 mt-0 opacity-0"
              }`}
            >
              <div className="rounded bg-zinc-50 p-2 whitespace-pre-wrap text-sm text-zinc-700 border border-zinc-100">
                {item.body}
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <div className="mt-2 flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
              <span className="text-zinc-600">Видалити?</span>
              <button
                type="button"
                disabled={actionLoading}
                onClick={onConfirmDelete}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Так
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Ні
              </button>
            </div>
          )}

          {!showDeleteConfirm && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{occurredAt}</span>
              <span>·</span>
              <span>by {item.createdByName ?? item.createdBy}</span>
            </div>
          )}

          {!showDeleteConfirm && showRecordingUi && (
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <CallRecordingPlayer
                url={call.recordingUrl}
                status={call.recordingStatus ?? (call.recordingUrl ? "READY" : undefined)}
                durationSec={call.talkSec ?? call.durationSec}
                sessionId={item.id}
                title={item.title || "Звонок"}
                subtitle={recordingSubtitle}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

