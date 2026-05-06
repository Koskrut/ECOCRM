"use client";

import { Pencil, Phone, Pin, PinOff, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/crmDatetime";
import type { TimelineItem } from "./types";
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
  if (item.kind === "status_change") return "Статус";
  if (item.kind === "shipment") return "TTN";
  if (item.kind === "call" || item.kind === "manual_call") return "Звонок";
  if (item.kind === "meeting") return "Встреча";
  if (item.kind === "comment") return "Комментарий";
  return item.source;
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

  if (loading) return <div className="text-sm text-zinc-500">Loading timeline...</div>;
  if (error) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>
    );
  }
  if (items.length === 0) return <div className="text-sm text-zinc-500">Пока нет событий</div>;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isActivity = item.source === "activity";
        const canMutate = isActivity && (item.canEdit || item.canDelete || item.canPin);
        const isEditing = editingId === item.id;
        const isConfirmDelete = confirmDeleteId === item.id;
        return (
          <div key={item.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                {(item.kind === "call" || item.kind === "manual_call") && (
                  <Phone className="h-4 w-4 text-emerald-600" />
                )}
                <span>{item.title}</span>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                  {sourceBadge(item)}
                </span>
                {item.pinnedAt ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                    pinned
                  </span>
                ) : null}
              </div>
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
              ) : item.body ? (
                <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{item.body}</div>
              ) : null}
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
            <div className="mt-2 text-xs text-zinc-500">by {item.actor.name}</div>
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
