"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { CanonicalTimeline } from "@/components/timeline/CanonicalTimeline";
import { useCanonicalTimeline } from "@/components/timeline/useCanonicalTimeline";

type Props = {
  orderId: string;
  onItemsCountChange?: (count: number) => void;
};

export function OrderTimeline({ orderId, onItemsCountChange }: Props) {
  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const timeline = useCanonicalTimeline({ entityType: "order", entityId: orderId });

  useEffect(() => {
    onItemsCountChange?.(timeline.items.length);
  }, [onItemsCountChange, timeline.items.length]);

  const activitiesUrl = useMemo(() => `orders/${orderId}/activities`, [orderId]);

  const addActivity = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await apiHttp.post(activitiesUrl, { type: mode, body: text.trim() });
      setText("");
      await timeline.refresh();
    } finally {
      setSaving(false);
    }
  }, [activitiesUrl, mode, text, timeline]);

  const placeholder =
    mode === "CALL"
      ? "Коротко: про що був дзвінок?"
      : mode === "MEETING"
        ? "Коротко: результат зустрічі?"
        : "Напишіть коментар…";


  const toActivityId = useCallback((canonicalId: string): string => {
    return canonicalId.startsWith("activity:") ? canonicalId.slice("activity:".length) : canonicalId;
  }, []);

  const handleEditActivity = useCallback(
    async (item: { id: string }, nextBody: string) => {
      if (!nextBody.trim()) return;
      setActionLoading(true);
      try {
        await apiHttp.patch(`activities/${toActivityId(item.id)}`, { body: nextBody.trim() });
        await timeline.refresh();
      } finally {
        setActionLoading(false);
      }
    },
    [timeline, toActivityId],
  );

  const handleDeleteActivity = useCallback(
    async (item: { id: string }) => {
      setActionLoading(true);
      try {
        await apiHttp.delete(`activities/${toActivityId(item.id)}`);
        await timeline.refresh();
      } finally {
        setActionLoading(false);
      }
    },
    [timeline, toActivityId],
  );

  const handleTogglePinActivity = useCallback(
    async (item: { id: string; pinnedAt: string | null }) => {
      setActionLoading(true);
      try {
        await apiHttp.patch(`activities/${toActivityId(item.id)}`, {
          pinnedAt: item.pinnedAt ? null : new Date().toISOString(),
        });
        await timeline.refresh();
      } finally {
        setActionLoading(false);
      }
    },
    [timeline, toActivityId],
  );
  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm max-lg:h-auto lg:h-full">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode("CALL")} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${mode === "CALL" ? "bg-accent-gradient text-white border-transparent" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Дзвінок</button>
          <button type="button" onClick={() => setMode("MEETING")} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${mode === "MEETING" ? "bg-accent-gradient text-white border-transparent" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Зустріч</button>
          <button type="button" onClick={() => setMode("COMMENT")} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${mode === "COMMENT" ? "bg-accent-gradient text-white border-transparent" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Коментар</button>
        </div>

        <div className="mt-3">
          <textarea className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200" rows={3} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />

          <div className="mt-2 flex items-center justify-between">
            <button type="button" disabled={saving || !text.trim()} onClick={() => void addActivity()} className="btn-primary py-1.5">{saving ? "Збереження…" : "Додати"}</button>
            <button type="button" onClick={() => void timeline.refresh()} className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Оновити</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <CanonicalTimeline items={timeline.items} loading={timeline.loading} loadingMore={timeline.loadingMore} error={timeline.error} nextCursor={timeline.nextCursor} onLoadMore={() => void timeline.loadMore()} onEditActivity={handleEditActivity} onDeleteActivity={handleDeleteActivity} onTogglePinActivity={handleTogglePinActivity} actionLoading={actionLoading} />
      </div>
    </div>
  );
}
