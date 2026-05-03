"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type Row = { id: string; key: string; name: string; system?: boolean; isActive?: boolean; _count?: { items: number } };

export default function DictionariesMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refresh = () =>
    apiHttp
      .get<{ items: Row[] }>("/dictionaries")
      .then((r) => setRows(r.data?.items ?? []))
      .catch(() => setErr("Не вдалося завантажити словники"));

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
          ← Metadata hub
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Dictionaries</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Create dictionary</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="min-w-[10rem] rounded border border-zinc-200 px-2 py-1 font-mono text-xs"
              placeholder="key (e.g. region.ukr)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <input
              className="min-w-[12rem] flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
              placeholder="Display name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="button"
              className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
              onClick={() => {
                setErr(null);
                setMsg(null);
                void apiHttp
                  .post("/dictionaries", { key: newKey.trim(), name: newName.trim() })
                  .then(() => {
                    setMsg("Created");
                    void refresh();
                  })
                  .catch(() => setErr("Create failed"));
              }}
            >
              Create
            </button>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((d) => (
            <li key={d.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <span className="font-mono text-xs text-zinc-600">{d.key}</span> — {d.name}
              <span className="ml-2 text-xs text-zinc-400">items: {d._count?.items ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
