"use client";

import Link from "next/link";
import { strings } from "@/locales";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { apiHttp } from "@/lib/api/client";
import { visitsApi, type VisitHistoryItem } from "@/lib/api/resources/visits";
import { VisitsSubNav } from "../VisitsSubNav";

type MeUser = { role?: string };

type UserRow = { id: string; fullName: string; email: string; role: string };

export default function VisitsHistoryPage() {
  const [role, setRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [from, setFrom] = useState(() =>
    format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
  );
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
  const formatDateTime = (value?: string | null) =>
    value ? format(new Date(value), "yyyy-MM-dd HH:mm") : "—";

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-5xl">
        <VisitsSubNav />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{strings.nav.visitsHistory}</h1>
            <p className="text-sm text-zinc-500">Завершені візити</p>
          </div>
          <Link href="/visits" className="text-sm font-medium text-emerald-700 hover:underline">
            ← До планування
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
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              {loading ? "Загрузка…" : "Нет записей"}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {items.map((v) => (
                <div key={v.id} className="p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-zinc-900">
                        {v.title || v.addressText || "—"}
                      </div>
                      {v.contact ? (
                        <div className="text-xs text-zinc-500">
                          {v.contact.firstName} {v.contact.lastName}
                        </div>
                      ) : null}
                    </div>
                    {showOwnerFilter ? (
                      <div className="text-right text-xs text-zinc-500">
                        {v.owner?.fullName ?? v.owner?.email ?? "—"}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <section className="rounded-md border border-emerald-100 bg-emerald-50/50 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        План
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <dt className="text-zinc-500">Дата</dt>
                          <dd className="text-right text-zinc-800">{formatDateTime(v.startsAt)}</dd>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <dt className="text-zinc-500">Цель</dt>
                          <dd className="text-right text-zinc-800">{v.purpose || "—"}</dd>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <dt className="text-zinc-500">Длительность</dt>
                          <dd className="text-right text-zinc-800">
                            {v.durationMin ? `${v.durationMin} мин` : "—"}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-md border border-blue-100 bg-blue-50/50 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                        Факт
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <dt className="text-zinc-500">Дата</dt>
                          <dd className="text-right text-zinc-800">
                            {formatDateTime(v.completedAt)}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <dt className="text-zinc-500">Результат</dt>
                          <dd className="text-right text-zinc-800">{v.outcome ?? "—"}</dd>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <dt className="text-zinc-500">Комментарий</dt>
                          <dd className="text-right text-zinc-800">{v.resultNote || "—"}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                </div>
              ))}
            </div>
          )}
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
