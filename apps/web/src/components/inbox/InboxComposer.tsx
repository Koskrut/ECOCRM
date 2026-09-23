"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Send, Sparkles, StickyNote } from "lucide-react";
import {
  applyCannedPlaceholders,
  cannedResponsesApi,
  type CannedResponseItem,
} from "@/lib/api/resources/canned-responses";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendNote: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholderContext?: { clientName?: string | null; phone?: string | null };
  /** Telegram AI suggestions */
  showAiSuggest?: boolean;
  onSuggestReplies?: () => void;
  suggestLoading?: boolean;
  suggestions?: string[];
};

export function InboxComposer({
  value,
  onChange,
  onSend,
  onSendNote,
  sending,
  disabled,
  placeholderContext,
  showAiSuggest,
  onSuggestReplies,
  suggestLoading,
  suggestions = [],
}: Props) {
  const [noteMode, setNoteMode] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<CannedResponseItem[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(async () => {
    if (templatesLoaded) return;
    try {
      const res = await cannedResponsesApi.list();
      setTemplates(res.items ?? []);
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoaded(true);
    }
  }, [templatesLoaded]);

  useEffect(() => {
    if (templatesOpen) void loadTemplates();
  }, [templatesOpen, loadTemplates]);

  const slashQuery = useMemo(() => {
    const m = value.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [value]);

  useEffect(() => {
    if (slashQuery !== null) {
      setTemplatesOpen(true);
      void loadTemplates();
    }
  }, [slashQuery, loadTemplates]);

  const filteredTemplates = useMemo(() => {
    if (slashQuery === null && !templatesOpen) return [];
    const q = slashQuery ?? "";
    if (!q) return templates;
    return templates.filter(
      (t) =>
        (t.shortcut && t.shortcut.toLowerCase().includes(q)) ||
        t.title.toLowerCase().includes(q),
    );
  }, [templates, slashQuery, templatesOpen]);

  const insertTemplate = (tpl: CannedResponseItem) => {
    const filled = applyCannedPlaceholders(tpl.body, placeholderContext ?? {});
    if (slashQuery !== null) {
      onChange(value.replace(/(?:^|\s)\/[a-zA-Z0-9_-]*$/, (m) => {
        const leading = m.startsWith(" ") || m.startsWith("\n") ? m[0] : "";
        return `${leading}${filled}`;
      }));
    } else {
      onChange(value ? `${value}${value.endsWith(" ") ? "" : " "}${filled}` : filled);
    }
    setTemplatesOpen(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (noteMode) onSendNote();
    else onSend();
  };

  return (
    <div className="border-t border-zinc-200 p-3">
      {suggestions.length > 0 && !noteMode ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
            >
              {s.length > 80 ? s.slice(0, 77) + "…" : s}
            </button>
          ))}
        </div>
      ) : null}

      {templatesOpen && filteredTemplates.length > 0 ? (
        <div className="mb-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          {filteredTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => insertTemplate(tpl)}
              className="flex w-full flex-col gap-0.5 border-b border-zinc-100 px-3 py-2 text-left last:border-0 hover:bg-zinc-50"
            >
              <span className="text-xs font-medium text-zinc-900">
                {tpl.title}
                {tpl.shortcut ? (
                  <span className="ml-1 text-zinc-400">/{tpl.shortcut}</span>
                ) : null}
              </span>
              <span className="truncate text-[11px] text-zinc-500">{tpl.body}</span>
            </button>
          ))}
        </div>
      ) : null}

      {noteMode ? (
        <p className="mb-1.5 text-[11px] font-medium text-amber-700">
          Внутрішня нотатка — клієнт не побачить
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <button
          type="button"
          onClick={() => {
            setTemplatesOpen((v) => !v);
            void loadTemplates();
          }}
          title="Шаблони відповідей"
          aria-label="Шаблони"
          className="rounded-lg border border-zinc-200 px-2.5 py-2 text-zinc-600 hover:bg-zinc-50"
        >
          <FileText className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setNoteMode((v) => !v)}
          title="Внутрішня нотатка"
          aria-label="Нотатка"
          className={`rounded-lg border px-2.5 py-2 ${
            noteMode
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          <StickyNote className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={noteMode ? "Нотатка для команди…" : "Повідомлення… (/ для шаблонів)"}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 ${
            noteMode
              ? "border-amber-300 focus:border-amber-400 focus:ring-amber-400"
              : "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-400"
          }`}
          disabled={sending || disabled}
        />
        {showAiSuggest && onSuggestReplies ? (
          <button
            type="button"
            onClick={() => void onSuggestReplies()}
            disabled={suggestLoading || noteMode}
            title="Підказати варіанти відповіді (AI)"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            aria-label="Підказати відповідь"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!value.trim() || sending || disabled}
          className={`rounded-lg px-4 py-2 text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 ${
            noteMode ? "bg-amber-600" : "bg-accent-gradient"
          }`}
          aria-label={noteMode ? "Зберегти нотатку" : "Відправити"}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
