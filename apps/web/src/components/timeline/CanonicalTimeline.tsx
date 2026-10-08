"use client";

import { ArrowRightLeft, MessageSquare, Pencil, Phone, Pin, PinOff, Truck, Users, Trash2 } from "lucide-react";
import { CallRecordingPlayer } from "@/components/calls/CallRecordingPlayer";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { formatDateTime } from "@/lib/crmDatetime";
import { callFacts, statusTransition, timelineActorName, timelineBody, timelineTitle } from "@/lib/timelineDisplay";
import type { TimelineCallMeta, TimelineItem, TimelineKind } from "./types";
import { useState } from "react";

type Props = {
  items: TimelineItem[];
  loading: boolean;
  loadingMore?: boolean;
  error?: string | null;
  nextCursor?: string | null;
  onLoadMore?: () => void;
  onEditActivity?: (item: TimelineItem, nextBody: string) => Promise<void>;
  onDeleteActivity?: (item: TimelineItem) => Promise<void>;
  onTogglePinActivity?: (item: TimelineItem) => Promise<void>;
  actionLoading?: boolean;
};

function sourceBadge(item: TimelineItem): string {
  if (item.kind === "status_change") return "Етап";
  if (item.kind === "shipment") return "ТТН";
  if (item.kind === "call" || item.kind === "manual_call") return "Дзвінок";
  if (item.kind === "meeting") return "Зустріч";
  if (item.kind === "comment") return "Коментар";
  if (item.kind === "visit") return "Візит";
  return item.source;
}

function callMetaFromItem(item: TimelineItem): TimelineCallMeta | null {
  if (item.meta.kind !== "call") return null;
  return item.meta.data;
}

function showCallRecordingUi(call: TimelineCallMeta): boolean {
  return (
    !!call.recordingUrl ||
    ["PENDING", "FAILED", "READY"].includes((call.recordingStatus ?? "").toUpperCase())
  );
}

function KindIcon({ kind }: { kind: TimelineKind }) {
  const className = "h-4 w-4";
  if (kind === "call" || kind === "manual_call") return <Phone className={`${className} text-emerald-600`} />;
  if (kind === "meeting") return <Users className={`${className} text-sky-600`} />;
  if (kind === "status_change") return <ArrowRightLeft className={`${className} text-violet-600`} />;
  if (kind === "shipment") return <Truck className={`${className} text-amber-600`} />;
  return <MessageSquare className={`${className} text-zinc-500`} />;
}

export function CanonicalTimeline({
  items,
  loading,
  loadingMore = false,
  error = null,
  nextCursor = null,
  onLoadMore,
  onEditActivity,
  onDeleteActivity,
  onTogglePinActivity,
  actionLoading = false,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (loading) return <div className="text-sm text-zinc-500">Завантаження…</div>;
  if (error) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>
    );
  }
  if (items.length === 0) return <div className="text-sm text-zinc-500">Подій поки немає</div>;

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isCallLike = item.kind === "call" || item.kind === "manual_call";
        const callMeta = isCallLike ? callMetaFromItem(item) : null;
        const title = timelineTitle(item);
        const body = timelineBody(item);
        const facts = callFacts(item);
        const transition = statusTransition(item);
        const shipment = item.meta.kind === "shipment" ? item.meta.data : null;
        const isActivity = item.source === "activity";
        const canMutate = isActivity && (item.canEdit || item.canDelete || item.canPin);
        const isEditing = editingId === item.id;
        const isConfirmDelete = confirmDeleteId === item.id;
        const badge = sourceBadge(item);
        const showBadge = badge !== title && !title.startsWith(badge);
        return (
          <div key={item.id} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <KindIcon kind={item.kind} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">{title}</span>
                      {showBadge ? (
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          {badge}
                        </span>
                      ) : null}
                      {item.pinnedAt ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Закріплено
                        </span>
                      ) : null}
                    </div>
                    {transition ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          {transition.from}
                        </span>
                        <span className="text-zinc-400">→</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          {transition.to}
                        </span>
                      </div>
                    ) : null}
                    {facts.length > 0 ? (
                      <div className="mt-1 text-sm text-zinc-700">{facts.join(" · ")}</div>
                    ) : null}
                    {shipment ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <TtnStatusBadge
                          statusCode={shipment.statusCode}
                          statusText={shipment.statusText}
                          size="md"
                        />
                        {shipment.carrier ? (
                          <span className="text-xs text-zinc-500">{shipment.carrier}</span>
                        ) : null}
                        {typeof shipment.cost === "number" ? (
                          <span className="text-xs text-zinc-500">
                            {new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(shipment.cost)} ₴
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                          rows={3}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => {
                              if (!onEditActivity) return;
                              void onEditActivity(item, editBody.trim()).then(() => {
                                setEditingId(null);
                              });
                            }}
                            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                          >
                            Зберегти
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                          >
                            Скасувати
                          </button>
                        </div>
                      </div>
                    ) : body ? (
                      <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{body}</div>
                    ) : null}
                    {callMeta && showCallRecordingUi(callMeta) ? (
                      <div className="mt-2">
                        <CallRecordingPlayer
                          url={callMeta.recordingUrl}
                          status={callMeta.recordingStatus ?? (callMeta.recordingUrl ? "READY" : undefined)}
                          durationSec={callMeta.talkSec ?? callMeta.durationSec}
                          sessionId={item.id}
                          title={title || "Дзвінок"}
                        />
                      </div>
                    ) : null}
                    <div className="mt-1.5 text-xs text-zinc-500">{timelineActorName(item.actor.name)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="whitespace-nowrap text-xs text-zinc-500">{formatDateTime(item.at)}</div>
                    {canMutate && !isEditing ? (
                      <div className="flex items-center gap-1">
                        {item.canPin && onTogglePinActivity ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => void onTogglePinActivity(item)}
                            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                            title={item.pinnedAt ? "Відкріпити" : "Закріпити"}
                          >
                            {item.pinnedAt ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          </button>
                        ) : null}
                        {item.canEdit && onEditActivity ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => {
                              setEditBody(item.body ?? "");
                              setEditingId(item.id);
                            }}
                            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                            title="Редагувати"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {item.canDelete && onDeleteActivity ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                            title="Видалити"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                {isConfirmDelete && onDeleteActivity ? (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-zinc-600">Видалити?</span>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => {
                        void onDeleteActivity(item).then(() => setConfirmDeleteId(null));
                      }}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Так
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Ні
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      {nextCursor && onLoadMore ? (
        <div className="pt-1">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {loadingMore ? "Завантаження…" : "Завантажити ще"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
