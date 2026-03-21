"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { apiHttp } from "@/lib/api/client";
import { visitsApi, type VisitHistoryItem } from "@/lib/api/resources/visits";

type MeUser = { role?: string };

type UserRow = { id: string; fullName: string; email: string; role: string };

export default function VisitsHistoryPage() {
  const [role, setRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [from, setFrom] = useState(() => format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<VisitHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: MeUser }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN" && role !== "LEAD") return;
    apiHttp
      .get<{ items?: UserRow[] }>("/users")
      .then((r) => setUsers(r.data?.items ?? []))
      .catch(() => setUsers([]));
  }, [role]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await visitsApi.history({
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        ownerId: ownerId || undefined,
        page,
        pageSize: 30,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, ownerId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const showOwnerFilter = role === "ADMIN" || role === "LEAD";
  const colCount = showOwnerFilter ? 5 : 4;

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">История визитов</h1>
            <p className="text-sm text-zinc-500">Завершённые визиты</p>
          </div>
          <Link href="/visits" className="text-sm font-medium text-emerald-700 hover:underline">
            ← К планированию
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600">С</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
              className="mt-0.5 rounded border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">По</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
              className="mt-0.5 rounded border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </div>
          {showOwnerFilter ? (
            <div>
              <label className="block text-xs font-medium text-zinc-600">Менеджер</label>
              <select
                value={ownerId}
                onChange={(e) => {
                  setPage(1);
                  setOwnerId(e.target.value);
                }}
                className="mt-0.5 min-w-[200px] rounded border border-zinc-200 px-2 py-1.5 text-sm"
              >
                <option value="">Все доступные</option>
                {users
                  .filter((u) => u.role === "MANAGER" || u.role === "USER" || u.role === "LEAD")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "…" : "Обновить"}
          </button>
        </div>

        {err ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Дата</th>
                {(role === "ADMIN" || role === "LEAD") && <th className="px-3 py-2">Менеджер</th>}
                <th className="px-3 py-2">Визит</th>
                <th className="px-3 py-2">Цель</th>
                <th className="px-3 py-2">Результат</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-8 text-center text-zinc-500">
                    {loading ? "Загрузка…" : "Нет записей"}
                  </td>
                </tr>
              ) : (
                items.map((v) => (
                  <tr key={v.id} className="border-b border-zinc-100">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                      {v.completedAt ? format(new Date(v.completedAt), "yyyy-MM-dd HH:mm") : "—"}
                    </td>
                    {(role === "ADMIN" || role === "LEAD") && (
                      <td className="px-3 py-2 text-zinc-700">{v.owner?.fullName ?? v.owner?.email ?? "—"}</td>
                    )}
                    <td className="max-w-xs px-3 py-2">
                      <div className="font-medium text-zinc-900">{v.title || v.addressText || "—"}</div>
                      {v.contact ? (
                        <div className="text-xs text-zinc-500">
                          {v.contact.firstName} {v.contact.lastName}
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-zinc-600">{v.purpose || "—"}</td>
                    <td className="px-3 py-2 text-zinc-700">{v.outcome ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 30 ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-zinc-200 px-3 py-1 disabled:opacity-50"
            >
              Назад
            </button>
            <span className="text-zinc-600">
              Стр. {page} · всего {total}
            </span>
            <button
              type="button"
              disabled={page * 30 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-zinc-200 px-3 py-1 disabled:opacity-50"
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
