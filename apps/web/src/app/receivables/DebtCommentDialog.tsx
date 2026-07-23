"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import {
  receivablesApi,
  type DebtComment,
} from "@/lib/api/resources/receivables";

export function DebtCommentDialog({
  contactId,
  clientName,
  onClose,
  onSaved,
}: {
  contactId: string;
  clientName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = strings.receivables;
  const [text, setText] = useState("");
  const [comments, setComments] = useState<DebtComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await receivablesApi.listDebtComments(contactId, 30);
      setComments(res.data.items ?? []);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [contactId, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await receivablesApi.addDebtComment(contactId, text.trim());
      setText("");
      await load();
      onSaved();
    } catch {
      setError(t.commentError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{t.commentTitle}</h2>
          <p className="mt-0.5 truncate text-sm text-zinc-500">{clientName}</p>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-sm">
            <span className="sr-only">{t.commentAdd}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              rows={3}
              placeholder={t.commentPlaceholder}
              className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              autoFocus
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t.commentHistory}
            </div>
            {loading ? (
              <div className="text-sm text-zinc-500">{strings.common.loading}</div>
            ) : comments.length === 0 ? (
              <div className="text-sm text-zinc-500">{t.commentEmptyHistory}</div>
            ) : (
              <ul className="space-y-2">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        {c.authorName ?? "—"}
                      </span>
                      <span>{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-800">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.commentCancel}
          </button>
          <button
            type="button"
            disabled={!text.trim() || saving}
            onClick={() => void save()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? strings.common.loading : t.commentSave}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Compact comment form + history for contact card tab. */
export function DebtCommentSection({
  contactId,
  initialComments,
  onChanged,
}: {
  contactId: string;
  initialComments: DebtComment[];
  onChanged?: () => void;
}) {
  const t = strings.receivables;
  const [text, setText] = useState("");
  const [comments, setComments] = useState(initialComments);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await receivablesApi.addDebtComment(contactId, text.trim());
      setComments((prev) => [res.data, ...prev]);
      setText("");
      onChanged?.();
    } catch {
      setError(t.commentError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 text-sm font-medium text-zinc-900">{t.commentHistory}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        rows={2}
        placeholder={t.commentPlaceholder}
        className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {error ? <span className="text-xs text-red-600">{error}</span> : <span />}
        <button
          type="button"
          disabled={!text.trim() || saving}
          onClick={() => void save()}
          className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? strings.common.loading : t.commentSave}
        </button>
      </div>
      {comments.length === 0 ? (
        <div className="mt-3 text-sm text-zinc-500">{t.commentEmptyHistory}</div>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-zinc-50 px-2.5 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-700">{c.authorName ?? "—"}</span>
                <span>{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-zinc-800">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
