"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type LayoutRow = {
  id: string;
  key: string;
  name: string;
  entityType: string;
  type: string;
  isActive?: boolean;
};

export default function LayoutsMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<LayoutRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lKey, setLKey] = useState("contact.card.default");
  const [lName, setLName] = useState("Contact card");
  const [lEntity, setLEntity] = useState("CONTACT");
  const [lType, setLType] = useState("CARD");

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refresh = () =>
    apiHttp
      .get<{ items: LayoutRow[] }>("/layouts")
      .then((r) => setRows(r.data?.items ?? []))
      .catch(() => setErr("Не вдалося завантажити макети"));

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
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Макети інтерфейсу</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Створити шаблон макета</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              className="rounded border border-zinc-200 px-2 py-1 font-mono text-xs"
              value={lKey}
              onChange={(e) => setLKey(e.target.value)}
              placeholder="Ключ макета"
            />
            <input
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={lName}
              onChange={(e) => setLName(e.target.value)}
              placeholder="Назва макета"
            />
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={lEntity}
              onChange={(e) => setLEntity(e.target.value)}
            >
              {["CONTACT", "COMPANY", "LEAD", "ORDER", "PRODUCT"].map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={lType}
              onChange={(e) => setLType(e.target.value)}
            >
              {["CARD", "FORM", "TABLE", "FILTERS"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="mt-2 rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
            onClick={() => {
              setErr(null);
              setMsg(null);
              void apiHttp
                .post("/layouts", {
                  key: lKey.trim(),
                  name: lName.trim(),
                  entityType: lEntity,
                  type: lType,
                  isActive: true,
                })
                .then(() => {
                  setMsg("Макет створено. Далі можна додати секції та поля.");
                  void refresh();
                })
                .catch(() => setErr("Не вдалося створити макет."));
            }}
          >
            Створити макет
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((l) => (
            <li key={l.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <span className="font-mono text-xs text-zinc-600">{l.entityType}</span> /{" "}
              <span className="font-mono text-xs">{l.type}</span> / {l.name}{" "}
              <span className="text-xs text-zinc-400">({l.key})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
