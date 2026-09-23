"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import {
  cannedResponsesApi,
  type CannedResponseItem,
} from "@/lib/api/resources/canned-responses";
import { authApi } from "@/lib/api/resources/auth";
import { getUserFriendlyApiError } from "@/lib/api/errors";

export default function InboxTemplatesSettingsPage() {
  const [items, setItems] = useState<CannedResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, me] = await Promise.all([cannedResponsesApi.list(), authApi.me()]);
      setItems(list.items ?? []);
      const role = me.user?.role;
      setCanEdit(role === "ADMIN" || role === "LEAD");
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося завантажити шаблони"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle("");
    setBody("");
    setShortcut("");
    setEditingId(null);
  };

  const startEdit = (item: CannedResponseItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setShortcut(item.shortcut ?? "");
  };

  const save = async () => {
    if (!canEdit || saving) return;
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError("Назва і текст обовʼязкові");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await cannedResponsesApi.update(editingId, {
          title: t,
          body: b,
          shortcut: shortcut.trim() || null,
        });
      } else {
        await cannedResponsesApi.create({
          title: t,
          body: b,
          shortcut: shortcut.trim() || null,
        });
      }
      resetForm();
      await load();
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося зберегти шаблон"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!canEdit || !window.confirm("Видалити шаблон?")) return;
    try {
      await cannedResponsesApi.remove(id);
      if (editingId === id) resetForm();
      await load();
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося видалити"));
    }
  };

  return (
    <SettingsPageShell
      title="Шаблони відповідей Inbox"
      subtitle="Швидкі відповіді для менеджерів. У чаті натисніть іконку шаблонів або введіть /shortcut. Підстановки: {clientName}, {phone}."
      maxWidthClassName="max-w-3xl"
    >
      {loading ? <PageLoading /> : null}
      {error ? <ErrorPanel message={error} /> : null}

      {!loading ? (
        <div className="space-y-6">
          {canEdit ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">
                {editingId ? "Редагувати шаблон" : "Новий шаблон"}
              </h3>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Назва (напр. Реквізити)"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="Shortcut без / (напр. rekvizyty)"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Текст відповіді…"
                rows={4}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Збереження…" : editingId ? "Оновити" : "Створити"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700"
                  >
                    Скасувати
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">
              Редагувати шаблони можуть лише керівники (LEAD) та адміністратори. Менеджери
              можуть використовувати наявні шаблони в чаті.
            </p>
          )}

          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
            {items.length === 0 ? (
              <li className="p-4 text-sm text-zinc-500">Шаблонів ще немає</li>
            ) : (
              items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {item.title}
                      {item.shortcut ? (
                        <span className="ml-2 text-xs font-normal text-zinc-400">
                          /{item.shortcut}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">{item.body}</p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Змінити
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Видалити
                      </button>
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </SettingsPageShell>
  );
}
