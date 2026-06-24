"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import type {
  AgendaPlanItem,
  AgendaPlanItemInput,
  AgendaSuggestion,
  DailyAgendaPayload,
} from "@/lib/api/resources/daily-agenda";
import { itemSourceKey, suggestionToPlanItem } from "@/lib/api/resources/daily-agenda";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

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
  availableSuggestions: AgendaSuggestion[];
  committedItems?: AgendaPlanItem[];
  onSaveDraft: (items: AgendaPlanItemInput[]) => Promise<void>;
  onCommit: (items: AgendaPlanItemInput[]) => Promise<void>;
  onLater?: (items: AgendaPlanItemInput[]) => Promise<void>;
  saving?: boolean;
};

export function DailyAgendaEditor({
  date,
  profile,
  initialItems,
  availableSuggestions,
  committedItems = [],
  onSaveDraft,
  onCommit,
  onLater,
  saving = false,
}: DailyAgendaEditorProps) {
  const doneKeys = useMemo(
    () => new Set(committedItems.filter((i) => i.status === "DONE").map((i) => itemSourceKey(i))),
    [committedItems],
  );

  const [items, setItems] = useState<EditorItem[]>(() => toEditorItems(initialItems));
  const [error, setError] = useState<string | null>(null);

  const usedKeys = useMemo(() => new Set(items.map((i) => i.localKey)), [items]);

  const addableSuggestions = availableSuggestions.filter((s) => {
    const key = itemSourceKey(suggestionToPlanItem(s, 0));
    return !usedKeys.has(key);
  });

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        {t.planCount(items.length)} · {profile === "field" ? t.profileField : t.profileOffice} · {date}
      </p>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.myPlan}</h3>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.emptyPlan}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {items.map((item, idx) => {
              const isDone = doneKeys.has(item.localKey);
              return (
                <li key={item.localKey} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-zinc-900">{item.title}</div>
                    {item.subtitle ? (
                      <div className="text-xs text-zinc-500">{item.subtitle}</div>
                    ) : null}
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-400">
                      <span>{item.kind}</span>
                      {item.scheduledAt ? <span>{formatTime(item.scheduledAt)}</span> : null}
                      {isDone ? (
                        <span className="rounded bg-emerald-100 px-1.5 text-emerald-800">{t.done}</span>
                      ) : null}
                    </div>
                  </div>
                  {!isDone ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveItem(item.localKey, -1)}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                        aria-label={t.moveUp}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === items.length - 1}
                        onClick={() => moveItem(item.localKey, 1)}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                        aria-label={t.moveDown}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.localKey)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        aria-label={t.remove}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {addableSuggestions.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.addToPlan}</h3>
          <ul className="space-y-1">
            {addableSuggestions.map((s) => (
              <li
                key={s.suggestionKey}
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium text-zinc-800">{s.title}</div>
                  <div className="text-xs text-zinc-500">{s.reason}</div>
                </div>
                <button
                  type="button"
                  onClick={() => addSuggestion(s)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-xs text-white hover:bg-zinc-800"
                >
                  <Plus className="h-3 w-3" />
                  {t.add}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
