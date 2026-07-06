"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { AgendaSuggestion, AgendaSuggestionCategory } from "@/lib/api/resources/daily-agenda";
import { suggestionToPlanItem } from "@/lib/api/resources/daily-agenda";
import { AgendaItemCard } from "./AgendaItemCard";
import { categoryConfig, CATEGORY_ORDER } from "./agendaKindConfig";
import { strings } from "@/locales";

const t = strings.dailyAgenda;
const VISIBLE_LIMIT = 5;

type Props = {
  grouped: Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>>;
  usedKeys: Set<string>;
  onAdd: (s: AgendaSuggestion) => void;
  onAddAll: (items: AgendaSuggestion[]) => void;
  profile: "office" | "field";
};

function filterAddable(items: AgendaSuggestion[], usedKeys: Set<string>) {
  return items.filter((s) => !usedKeys.has(s.suggestionKey));
}

export function AgendaSuggestionGroups({ grouped, usedKeys, onAdd, onAddAll, profile }: Props) {
  const order = CATEGORY_ORDER.filter((cat) => {
    if (profile === "field" && (cat === "queue" || cat === "orders")) return false;
    if (profile === "office" && cat === "route") return false;
    return (grouped[cat]?.length ?? 0) > 0;
  });

  if (order.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.addToPlan}</h3>
      {order.map((cat) => (
        <SuggestionGroup
          key={cat}
          category={cat}
          items={grouped[cat] ?? []}
          usedKeys={usedKeys}
          onAdd={onAdd}
          onAddAll={onAddAll}
        />
      ))}
    </div>
  );
}

function SuggestionGroup({
  category,
  items,
  usedKeys,
  onAdd,
  onAddAll,
}: {
  category: AgendaSuggestionCategory;
  items: AgendaSuggestion[];
  usedKeys: Set<string>;
  onAdd: (s: AgendaSuggestion) => void;
  onAddAll: (items: AgendaSuggestion[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const addable = filterAddable(items, usedKeys);
  if (addable.length === 0) return null;

  const config = categoryConfig(category);
  const Icon = config.icon;
  const visible = showAll ? addable : addable.slice(0, VISIBLE_LIMIT);
  const hiddenCount = addable.length - VISIBLE_LIMIT;

  return (
    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-zinc-800"
        >
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="truncate">{config.label}</span>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-600">
            {addable.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onAddAll(addable)}
          className="shrink-0 text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {t.addAll}
        </button>
      </div>

      {expanded ? (
        <ul className="space-y-2 px-3 pb-3">
          {visible.map((s) => (
            <li
              key={s.suggestionKey}
              className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-2"
            >
              <div className="min-w-0 flex-1">
                <AgendaItemCard item={suggestionToPlanItem(s, 0)} compact />
              </div>
              <button
                type="button"
                onClick={() => onAdd(s)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-xs text-white hover:bg-zinc-800"
              >
                <Plus className="h-3 w-3" />
                {t.add}
              </button>
            </li>
          ))}
          {!showAll && hiddenCount > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-sky-700 hover:underline"
              >
                {t.showMore(hiddenCount)}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
