"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type Def = { id: string; key: string; name: string; pluralName?: string | null };

export default function CustomEntitiesMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [defs, setDefs] = useState<Def[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("asset");
  const [newName, setNewName] = useState("Asset");

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refresh = () =>
    apiHttp
      .get<{ items: Def[] }>("/custom-entities/definitions")
      .then((r) => setDefs(r.data?.items ?? []))
      .catch(() => setErr("Не вдалося завантажити користувацькі сутності"));

  useEffect(() => {
    if (role !== "ADMIN") return;
    void refresh();
  }, [role]);

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Хаб метаданих
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Користувацькі сутності</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Створити визначення сутності</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="rounded border border-zinc-200 px-2 py-1 font-mono text-xs"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Ключ сутності"
            />
            <input
              className="min-w-[12rem] flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Назва сутності"
            />
            <button
              type="button"
              className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
              onClick={() => {
                setErr(null);
                setMsg(null);
                void apiHttp
                  .post("/custom-entities/definitions", { key: newKey.trim(), name: newName.trim() })
                  .then(() => {
                    setMsg("Сутність створено.");
                    void refresh();
                  })
                  .catch(() => setErr("Не вдалося створити сутність."));
              }}
            >
              Створити
            </button>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {defs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <span>
                <span className="font-mono text-xs">{d.key}</span> — {d.name}
              </span>
              <Link
                href={`/custom-data/${encodeURIComponent(d.key)}`}
                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Відкрити записи
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
