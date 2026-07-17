"use client";

import { useCallback, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { CanonicalTimeline } from "@/components/timeline/CanonicalTimeline";
import { useCanonicalTimeline } from "@/components/timeline/useCanonicalTimeline";
import type { TimelineKind } from "@/components/timeline/types";

type TimelineFilter = "all" | "calls" | "missed" | "withRecording";

type Props = {
  apiBaseUrl: string;
  companyId: string;
};

export function CompanyTimeline({ apiBaseUrl: _apiBaseUrl, companyId }: Props) {
  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>("all");

  const filters = useMemo(() => {
    if (filter === "calls" || filter === "missed" || filter === "withRecording") {
      return { kinds: ["call", "manual_call"] as TimelineKind[] };
    }
    return undefined;
  }, [filter]);

  const timeline = useCanonicalTimeline({ entityType: "company", entityId: companyId, filters });
  const activitiesUrl = useMemo(() => `companies/${companyId}/activities`, [companyId]);

  const filteredItems = useMemo(() => {
    if (filter === "missed") {
      return timeline.items.filter((it) => {
        if (it.kind !== "call") return false;
        if (it.meta.kind !== "call") return false;
        return (it.meta.data.status ?? "").toUpperCase().includes("MISSED");
      });
    }
    if (filter === "withRecording") {
      return timeline.items.filter((it) => {
        if (it.kind !== "call") return false;
        if (it.meta.kind !== "call") return false;
        const url = it.meta.data.recordingUrl;
        const status = (it.meta.data.recordingStatus ?? "").toUpperCase();
        return !!url && (!status || status === "READY");
      });
    }
    return timeline.items;
  }, [filter, timeline.items]);

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
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode("CALL")} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${mode === "CALL" ? "bg-accent-gradient text-white border-transparent" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Дзвінок</button>
          <button type="button" onClick={() => setMode("MEETING")} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${mode === "MEETING" ? "bg-accent-gradient text-white border-transparent" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Зустріч</button>
          <button type="button" onClick={() => setMode("COMMENT")} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${mode === "COMMENT" ? "bg-accent-gradient text-white border-transparent" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Коментар</button>
        </div>

        <div className="mt-3">
          <textarea className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200" rows={3} placeholder={mode === "CALL" ? "Коротко: про що був дзвінок?" : mode === "MEETING" ? "Коротко: результат зустрічі?" : "Напишіть коментар…"} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex items-center justify-between">
            <button type="button" disabled={saving || !text.trim()} onClick={() => void addActivity()} className="btn-primary py-1.5">{saving ? "Збереження…" : "Додати"}</button>
            <button type="button" onClick={() => void timeline.refresh()} className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Оновити</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Фільтр:</span>
          <button type="button" onClick={() => setFilter("all")} className={`rounded-full px-3 py-1 ${filter === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"} text-xs font-medium`}>Усі</button>
          <button type="button" onClick={() => setFilter("calls")} className={`rounded-full px-3 py-1 ${filter === "calls" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"} text-xs font-medium`}>Дзвінки</button>
          <button type="button" onClick={() => setFilter("missed")} className={`rounded-full px-3 py-1 ${filter === "missed" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"} text-xs font-medium`}>Пропущені</button>
          <button type="button" onClick={() => setFilter("withRecording")} className={`rounded-full px-3 py-1 ${filter === "withRecording" ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"} text-xs font-medium`}>З записом</button>
        </div>

        <CanonicalTimeline
          items={filteredItems}
          loading={timeline.loading}
          loadingMore={timeline.loadingMore}
          error={timeline.error}
          nextCursor={timeline.nextCursor}
          onLoadMore={() => void timeline.loadMore()}
          onEditActivity={handleEditActivity}
          onDeleteActivity={handleDeleteActivity}
          onTogglePinActivity={handleTogglePinActivity}
          actionLoading={actionLoading}
        />
      </div>
    </div>
  );
}
