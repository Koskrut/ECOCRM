"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type Item = { id: string; key: string; label: string; entityType: string; type: string; isActive?: boolean };

export default function CustomFieldsMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cfEntity, setCfEntity] = useState("CONTACT");
  const [cfKey, setCfKey] = useState("client.segment");
  const [cfLabel, setCfLabel] = useState("Segment");
  const [cfType, setCfType] = useState("TEXT");

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refresh = () =>
    apiHttp
      .get<{ items: Item[] }>("/custom-fields/definitions")
      .then((r) => setItems(r.data?.items ?? []))
      .catch(() => setErr("Не вдалося завантажити визначення полів"));

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
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Custom fields</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Create definition</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={cfEntity}
              onChange={(e) => setCfEntity(e.target.value)}
            >
              {["CONTACT", "COMPANY", "LEAD", "ORDER", "PRODUCT", "TASK", "ACTIVITY"].map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={cfType}
              onChange={(e) => setCfType(e.target.value)}
            >
              {["TEXT", "NUMBER", "BOOLEAN", "DATE", "SELECT", "MULTISELECT", "JSON"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-zinc-200 px-2 py-1 font-mono text-xs"
              value={cfKey}
              onChange={(e) => setCfKey(e.target.value)}
              placeholder="key"
            />
            <input
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={cfLabel}
              onChange={(e) => setCfLabel(e.target.value)}
              placeholder="label"
            />
          </div>
          <button
            type="button"
            className="mt-2 rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
            onClick={() => {
              setErr(null);
              setMsg(null);
              void apiHttp
                .post("/custom-fields/definitions", {
                  entityType: cfEntity,
                  key: cfKey.trim(),
                  label: cfLabel.trim(),
                  type: cfType,
                  isActive: true,
                })
                .then(() => {
                  setMsg("Field created");
                  void refresh();
                })
                .catch(() => setErr("Create failed"));
            }}
          >
            Create field
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{it.entityType}</td>
                  <td className="px-3 py-2 font-mono text-xs">{it.key}</td>
                  <td className="px-3 py-2">{it.label}</td>
                  <td className="px-3 py-2">{it.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
