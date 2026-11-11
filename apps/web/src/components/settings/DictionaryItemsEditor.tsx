"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

export type DictItem = {
  id: string;
  key: string;
  label: string;
  value?: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata?: { internal?: boolean } | null;
};

export type DictionaryDetail = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  system?: boolean;
  items: DictItem[];
};

export function DictionaryItemsEditor({
  dictionaryKey,
  title,
  subtitle,
  backHref,
  backLabel = "← Назад",
  embedded = false,
}: {
  dictionaryKey: string;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  /** Hide page-level heading when nested inside another settings layout. */
  embedded?: boolean;
}) {
  const [detail, setDetail] = useState<DictionaryDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [itemKey, setItemKey] = useState("");
  const [itemLabel, setItemLabel] = useState("");
  const [itemSort, setItemSort] = useState("0");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState("0");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(() => {
    setLoading(true);
    setErr(null);
    return apiHttp
      .get<{ dictionary: DictionaryDetail }>(`/dictionaries/${encodeURIComponent(dictionaryKey)}`)
      .then((r) => setDetail(r.data?.dictionary ?? null))
      .catch(() => setErr("Не вдалося завантажити довідник"))
      .finally(() => setLoading(false));
  }, [dictionaryKey]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const createItem = () => {
    if (!detail) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    const sortOrder = Number.parseInt(itemSort, 10);
    void apiHttp
      .post(`/dictionaries/${detail.id}/items`, {
        key: itemKey.trim(),
        label: itemLabel.trim(),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      })
      .then(() => {
        setMsg("Властивість додано.");
        setItemKey("");
        setItemLabel("");
        setItemSort("0");
        void loadDetail();
      })
      .catch(() => setErr("Не вдалося додати. Код: латиниця, цифри, _ (і крапки)."))
      .finally(() => setBusy(false));
  };

  const saveItemEdit = (item: DictItem) => {
    if (!detail) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    const sortOrder = Number.parseInt(editSort, 10);
    void apiHttp
      .patch(`/dictionaries/${detail.id}/items/${item.id}`, {
        label: editLabel.trim(),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : item.sortOrder,
      })
      .then(() => {
        setMsg("Збережено.");
        setEditingItemId(null);
        void loadDetail();
      })
      .catch(() => setErr("Не вдалося зберегти елемент."))
      .finally(() => setBusy(false));
  };

  const removeItem = (item: DictItem) => {
    if (!detail) return;
    if (!confirm(`Прибрати «${item.label}» (${item.key}) з довідника?`)) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    void apiHttp
      .delete(`/dictionaries/${detail.id}/items/${item.id}`)
      .then(() => {
        setMsg("Елемент прибрано.");
        void loadDetail();
      })
      .catch(() => setErr("Не вдалося прибрати елемент."))
      .finally(() => setBusy(false));
  };

  const items = detail?.items ?? [];
  const heading = title ?? detail?.name ?? dictionaryKey;

  return (
    <div>
      {!embedded ? (
        <>
          {backHref ? (
            <a href={backHref} className="text-sm text-zinc-600 hover:text-zinc-900">
              {backLabel}
            </a>
          ) : null}
          <h1 className={`${backHref ? "mt-2" : ""} text-2xl font-bold text-zinc-900`}>{heading}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
          {detail?.description && !subtitle ? (
            <p className="mt-1 text-sm text-zinc-600">{detail.description}</p>
          ) : null}
          <p className="mt-1 font-mono text-xs text-zinc-500">{detail?.key ?? dictionaryKey}</p>
        </>
      ) : (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-zinc-900">{heading}</h2>
          <p className="font-mono text-xs text-zinc-500">{detail?.key ?? dictionaryKey}</p>
          {detail?.description ? <p className="mt-1 text-sm text-zinc-600">{detail.description}</p> : null}
        </div>
      )}

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Завантаження…</p>
      ) : !detail ? (
        <p className="mt-4 text-sm text-zinc-500">Довідник не знайдено. Перезапустіть backend — він створюється автоматично.</p>
      ) : (
        <div
          className={
            embedded
              ? "mt-2"
              : "mt-4 rounded-lg border border-zinc-200 bg-white p-4"
          }
        >
          <div className="mb-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Додати властивість
            </h3>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-zinc-600">Код</span>
                <input
                  value={itemKey}
                  onChange={(e) => setItemKey(e.target.value)}
                  placeholder="thread_pitch"
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-sm"
                />
              </label>
              <label className="flex min-w-0 flex-[1.4] flex-col gap-1">
                <span className="text-xs text-zinc-600">Підпис (UA)</span>
                <input
                  value={itemLabel}
                  onChange={(e) => setItemLabel(e.target.value)}
                  placeholder="Крок різьби"
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-zinc-600">Порядок</span>
                <input
                  value={itemSort}
                  onChange={(e) => setItemSort(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy || !itemKey.trim() || !itemLabel.trim()}
                onClick={createItem}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Додати
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">Поки немає елементів.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {items.map((item) => {
                const editing = editingItemId === item.id;
                const internal =
                  item.metadata &&
                  typeof item.metadata === "object" &&
                  (item.metadata as { internal?: boolean }).internal === true;
                return (
                  <li key={item.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                    {editing ? (
                      <>
                        <span className="w-40 shrink-0 font-mono text-xs text-zinc-500">{item.key}</span>
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
                        />
                        <input
                          value={editSort}
                          onChange={(e) => setEditSort(e.target.value)}
                          inputMode="numeric"
                          className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveItemEdit(item)}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Зберегти
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItemId(null)}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600"
                        >
                          Скасувати
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-900">
                            {item.label}
                            {internal ? (
                              <span className="ml-2 text-xs font-normal text-zinc-400">службове</span>
                            ) : null}
                          </p>
                          <p className="font-mono text-xs text-zinc-500">
                            {item.key} · порядок {item.sortOrder}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItemId(item.id);
                            setEditLabel(item.label);
                            setEditSort(String(item.sortOrder));
                          }}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                        >
                          Редагувати
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeItem(item)}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Прибрати
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
