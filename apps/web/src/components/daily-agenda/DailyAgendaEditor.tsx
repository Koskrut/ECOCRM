"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type {
  AgendaPlanItem,
  AgendaPlanItemInput,
  AgendaSuggestion,
  AgendaSuggestionCategory,
  DailyAgendaPayload,
} from "@/lib/api/resources/daily-agenda";
import { itemSourceKey, suggestionToPlanItem } from "@/lib/api/resources/daily-agenda";
import { AgendaItemCard } from "./AgendaItemCard";
import { AgendaProfileSidebar, AgendaSummaryStrip } from "./AgendaSummaryStrip";
import { AgendaSuggestionGroups } from "./AgendaSuggestionGroup";
import { buildAgendaSummaryLinks } from "./agendaSummaryLinks";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

type EditorItem = AgendaPlanItemInput & { localKey: string };

function toEditorItems(items: AgendaPlanItemInput[]): EditorItem[] {
  return items.map((item, idx) => ({
    ...item,
    position: idx,
    localKey: itemSourceKey(item),
  }));
}

export type DailyAgendaEditorProps = {
  date: string;
  profile: DailyAgendaPayload["profile"];
  initialItems: AgendaPlanItemInput[];
  groupedSuggestions: Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>>;
  summary: DailyAgendaPayload["summary"];
  committedItems?: AgendaPlanItem[];
  completion?: DailyAgendaPayload["completion"];
  onSaveDraft: (items: AgendaPlanItemInput[]) => Promise<void>;
  onCommit: (items: AgendaPlanItemInput[]) => Promise<void>;
  onLater?: (items: AgendaPlanItemInput[]) => Promise<void>;
  saving?: boolean;
  layout?: "stacked" | "split";
};

export function DailyAgendaEditor({
  date,
  profile,
  initialItems,
  groupedSuggestions,
  summary,
  committedItems = [],
  completion,
  onSaveDraft,
  onCommit,
  onLater,
  saving = false,
  layout = "stacked",
}: DailyAgendaEditorProps) {
  const doneKeys = useMemo(
    () => new Set(committedItems.filter((i) => i.status === "DONE").map((i) => itemSourceKey(i))),
    [committedItems],
  );

  const [items, setItems] = useState<EditorItem[]>(() => toEditorItems(initialItems));
  const [error, setError] = useState<string | null>(null);

  const usedKeys = useMemo(() => {
    const keys = new Set(items.map((i) => i.localKey));
    for (const item of items) {
      if (item.metadata?.suggestionKey) keys.add(item.metadata.suggestionKey);
    }
    return keys;
  }, [items]);

  const liveSummary = useMemo(
    () => ({
      ...summary,
      plan: {
        ...summary.plan,
        total: items.length,
        visits: items.filter((i) => i.kind === "VISIT").length,
        tasks: items.filter((i) => i.kind === "TASK").length,
        leads: items.filter((i) => i.kind === "LEAD").length,
        orders: items.filter((i) => i.metadata?.orderId).length,
        calls:
          items.filter(
            (i) =>
              i.kind === "CONTACT_ACTION" ||
              (i.kind === "SUGGESTION" && i.metadata?.suggestionCategory === "calls"),
          ).length,
      },
    }),
    [items, summary],
  );

  const summaryLinks = useMemo(
    () =>
      buildAgendaSummaryLinks({
        date,
        profile,
        items,
        groupedSuggestions,
      }),
    [date, profile, items, groupedSuggestions],
  );

  const stripItems = useCallback((): AgendaPlanItemInput[] => {
    return items
      .filter((i) => !doneKeys.has(i.localKey))
      .map((item, idx) => ({
        kind: item.kind,
        status: item.status ?? "PLANNED",
        position: idx,
        visitId: item.visitId,
        taskId: item.taskId,
        contactId: item.contactId,
        leadId: item.leadId,
        title: item.title,
        subtitle: item.subtitle,
        scheduledAt: item.scheduledAt,
        metadata: item.metadata,
      }));
  }, [items, doneKeys]);

  const mergeWithDone = useCallback((): AgendaPlanItemInput[] => {
    const done = committedItems
      .filter((i) => i.status === "DONE")
      .map((i, idx) => ({
        kind: i.kind,
        status: i.status,
        position: idx,
        visitId: i.visitId,
        taskId: i.taskId,
        contactId: i.contactId,
        leadId: i.leadId,
        title: i.title,
        subtitle: i.subtitle,
        scheduledAt: i.scheduledAt,
        metadata: i.metadata,
      }));
    const planned = stripItems().map((item, idx) => ({ ...item, position: done.length + idx }));
    return [...done, ...planned];
  }, [committedItems, stripItems]);

  function removeItem(key: string) {
    setItems((prev) =>
      toEditorItems(prev.filter((i) => i.localKey !== key).map(({ localKey: _, ...rest }) => rest)),
    );
  }

  function addSuggestion(s: AgendaSuggestion) {
    setItems((prev) => {
      const next = [...prev.map(({ localKey: _, ...rest }) => rest), suggestionToPlanItem(s, prev.length)];
      return toEditorItems(next);
    });
  }

  function addSuggestions(list: AgendaSuggestion[]) {
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.localKey));
      const toAdd = list.filter((s) => !existing.has(s.suggestionKey));
      const next = [
        ...prev.map(({ localKey: _, ...rest }) => rest),
        ...toAdd.map((s, idx) => suggestionToPlanItem(s, prev.length + idx)),
      ];
      return toEditorItems(next);
    });
  }

  function moveItem(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.localKey === key);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [row] = copy.splice(idx, 1);
      copy.splice(target, 0, row);
      return toEditorItems(copy.map(({ localKey: _, ...rest }) => rest));
    });
  }

  async function handleDraft() {
    setError(null);
    try {
      await onSaveDraft(mergeWithDone());
    } catch (e) {
      setError(e instanceof Error ? e.message : t.saveFailed);
    }
  }

  async function handleCommit() {
    setError(null);
    try {
      await onCommit(mergeWithDone());
    } catch (e) {
      setError(e instanceof Error ? e.message : t.commitFailed);
    }
  }

  const planList = (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.myPlan}</h3>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-500">
          {t.emptyPlan}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, idx) => {
            const isDone = doneKeys.has(item.localKey);
            return (
              <li key={item.localKey}>
                <AgendaItemCard
                  item={item}
                  isDone={isDone}
                  showReorder={!isDone}
                  disableMoveUp={idx === 0}
                  disableMoveDown={idx === items.length - 1}
                  onMoveUp={() => moveItem(item.localKey, -1)}
                  onMoveDown={() => moveItem(item.localKey, 1)}
                  onRemove={() => removeItem(item.localKey)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const suggestionsPanel = (
    <AgendaSuggestionGroups
      grouped={groupedSuggestions}
      usedKeys={usedKeys}
      onAdd={addSuggestion}
      onAddAll={addSuggestions}
      profile={profile}
    />
  );

  const footer = (
    <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleDraft()}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {saving ? t.saving : t.saveDraft}
      </button>
      <button
        type="button"
        disabled={saving || items.length === 0}
        onClick={() => void handleCommit()}
        className="btn-primary text-sm disabled:opacity-50"
      >
        {saving ? t.saving : t.confirmPlan}
      </button>
      {onLater ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void onLater(mergeWithDone())}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          {t.later}
        </button>
      ) : null}
      {profile === "field" ? (
        <Link href={`/visits?date=${date}`} className="text-sm text-zinc-600 hover:text-zinc-900">
          {t.openRoute}
        </Link>
      ) : (
        <Link href="/work/calls/queue" className="text-sm text-zinc-600 hover:text-zinc-900">
          {t.openQueue}
        </Link>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <AgendaSummaryStrip
        summary={liveSummary}
        profile={profile}
        date={date}
        completion={completion}
        links={summaryLinks}
      />

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {layout === "split" ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            {planList}
            {footer}
          </div>
          <div className="space-y-4 lg:col-span-2">
            <AgendaProfileSidebar profile={profile} date={date} summary={liveSummary} />
            {suggestionsPanel}
          </div>
        </div>
      ) : (
        <>
          {planList}
          {suggestionsPanel}
          {footer}
        </>
      )}
    </div>
  );
}

export function DailyAgendaProgressBar({
  completion,
}: {
  completion: NonNullable<DailyAgendaPayload["completion"]>;
}) {
  const barClass =
    completion.status === "green"
      ? "bg-emerald-500"
      : completion.status === "yellow"
        ? "bg-amber-400"
        : "bg-red-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-zinc-600">
          {t.progress(completion.doneCount, completion.activeCount, completion.percent)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full transition-all ${barClass}`} style={{ width: `${completion.percent}%` }} />
      </div>
    </div>
  );
}
