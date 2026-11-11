"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { DictionaryItemsEditor } from "@/components/settings/DictionaryItemsEditor";
import { PRODUCT_CHARACTERISTICS_DICTIONARY_KEY } from "@/lib/product-spec-labels";

type DictRow = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  system?: boolean;
  isActive?: boolean;
  _count?: { items: number };
};

export default function DictionariesMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<DictRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refreshList = useCallback(() => {
    return apiHttp
      .get<{ items: DictRow[] }>("/dictionaries")
      .then((r) => setRows(r.data?.items ?? []))
      .catch(() => setErr("Не вдалося завантажити словники"));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void refreshList();
  }, [role, refreshList]);

  const crmRows = useMemo(
    () => rows.filter((r) => r.key !== PRODUCT_CHARACTERISTICS_DICTIONARY_KEY),
    [rows],
  );

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  const createDictionary = () => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    void apiHttp
      .post<{ dictionary: { key: string } }>("/dictionaries", {
        key: newKey.trim(),
        name: newName.trim(),
      })
      .then((r) => {
        setMsg("Довідник створено.");
        setNewKey("");
        setNewName("");
        const key = r.data?.dictionary?.key;
        void refreshList().then(() => {
          if (key) setSelectedKey(key);
        });
      })
      .catch(() => setErr("Не вдалося створити довідник."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Хаб метаданих
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">CRM-довідники</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Списки для кастомних полів (регіони, канали, причини…). Властивості товару — окремо:{" "}
          <Link
            href="/settings/catalog/characteristics"
            className="font-medium text-zinc-900 underline hover:text-zinc-700"
          >
            Характеристики товару
          </Link>
          .
        </p>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-zinc-900">Створити довідник</h2>
              <div className="mt-2 flex flex-col gap-2">
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-1 font-mono text-xs"
                  placeholder="Ключ (наприклад region.ukr)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  placeholder="Назва довідника"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !newKey.trim() || !newName.trim()}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={createDictionary}
                >
                  Створити
                </button>
              </div>
            </div>

            <ul className="space-y-1">
              {crmRows.map((d) => {
                const active = d.key === selectedKey;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(d.key)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                      }`}
                    >
                      <span className={`block font-mono text-xs ${active ? "text-zinc-300" : "text-zinc-500"}`}>
                        {d.key}
                      </span>
                      <span className="font-medium">{d.name}</span>
                      <span className={`ml-2 text-xs ${active ? "text-zinc-400" : "text-zinc-400"}`}>
                        {d._count?.items ?? 0}
                        {d.system ? " · system" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              {crmRows.length === 0 ? (
                <li className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
                  Немає CRM-довідників. Створіть зліва або керуйте характеристиками товару за посиланням вище.
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            {!selectedKey ? (
              <p className="text-sm text-zinc-500">Оберіть довідник зліва.</p>
            ) : (
              <DictionaryItemsEditor key={selectedKey} dictionaryKey={selectedKey} embedded />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
