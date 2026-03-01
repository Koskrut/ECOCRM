"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  leadsApi,
  type Lead,
  type LeadsResponse,
  type LeadStatus,
  type LeadSource,
} from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadModal } from "./LeadModal";
import { CreateLeadModal } from "./CreateLeadModal";

type StatusFilter = LeadStatus | "ALL";
type SourceFilter = LeadSource | "ALL";

function LeadsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const leadId = searchParams.get("leadId");
  const [createOpen, setCreateOpen] = useState(false);

  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [q, setQ] = useState("");

  const reload = useCallback(
    async (opts?: { keepPage?: boolean }) => {
      try {
        setLoading(true);
        setError(null);

        const effectivePage = opts?.keepPage ? page : 1;
        if (!opts?.keepPage) setPage(1);

        const params: Parameters<typeof leadsApi.list>[0] = {
          page: effectivePage,
          pageSize,
        };
        if (status !== "ALL") params.status = status;
        if (source !== "ALL") params.source = source;
        if (q.trim()) params.q = q.trim();

        const res: LeadsResponse = await leadsApi.list(params);
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Ошибка загрузки лидов");
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q, source, status],
  );

  useEffect(() => {
    void reload({ keepPage: true });
  }, [reload]);

  const openLead = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("leadId", id);
    router.replace(`/leads?${params.toString()}`);
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("leadId");
    const newUrl = params.toString() ? `/leads?${params.toString()}` : "/leads";
    router.replace(newUrl);
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const handleStatusChange = (value: StatusFilter) => {
    setStatus(value);
    void reload({ keepPage: false });
  };

  const handleSourceChange = (value: SourceFilter) => {
    setSource(value);
    void reload({ keepPage: false });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void reload({ keepPage: false });
  };

  const goToPage = (next: number) => {
    setPage(next);
    void reload({ keepPage: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Лиды</h1>
          <p className="text-sm text-zinc-500">Входящие обращения и потенциальные клиенты</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="btn-primary"
        >
          + Лид
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm text-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <input
            placeholder="Поиск по имени, телефону, email, компании, сообщению"
            className="input-base"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            Найти
          </button>
        </form>

        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
            className="rounded-md border border-zinc-200 px-2 py-2 text-sm"
          >
            <option value="ALL">Все статусы</option>
            <option value="NEW">Новые</option>
            <option value="IN_PROGRESS">В работе</option>
            <option value="WON">Успешные</option>
            <option value="NOT_TARGET">Нецелевые</option>
            <option value="LOST">Проваленные</option>
          </select>

          <select
            value={source}
            onChange={(e) => handleSourceChange(e.target.value as SourceFilter)}
            className="rounded-md border border-zinc-200 px-2 py-2 text-sm"
          >
            <option value="ALL">Все источники</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="WEBSITE">Сайт</option>
            <option value="OTHER">Другое</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm text-sm text-zinc-500">
          Загрузка…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Имя / Телефон</th>
                <th className="px-4 py-3">Источник</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Ответственный</th>
                <th className="px-4 py-3">Создан</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer border-t hover:bg-zinc-50"
                  onClick={() => openLead(l.id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">
                      {l.name || l.companyName || "Без имени"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {l.phone || l.email || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-700">{l.source}</td>
                  <td className="px-4 py-3 text-xs">
                    <StatusBadge variant="lead" status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {l.ownerId || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                        onClick={() => void leadsApi.updateStatus(l.id, { status: "IN_PROGRESS" })}
                      >
                        В работу
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
                        onClick={() => void leadsApi.updateStatus(l.id, { status: "WON" })}
                      >
                        Успешный
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                        onClick={() =>
                          void leadsApi.updateStatus(l.id, {
                            status: "NOT_TARGET",
                            reason: "Нецелевой",
                          })
                        }
                      >
                        Нецелевой
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
                        onClick={() =>
                          void leadsApi.updateStatus(l.id, {
                            status: "LOST",
                            reason: "Проваленный",
                          })
                        }
                      >
                        Проваленный
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                        onClick={() => openLead(l.id)}
                      >
                        Открыть
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr className="border-t">
                  <td className="px-4 py-6 text-center text-zinc-500" colSpan={6}>
                    Лидов нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
            <span>
              Страница {page} из {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white disabled:opacity-50"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white disabled:opacity-50"
              >
                Вперед
              </button>
            </div>
          </div>
        </div>
      )}

      {leadId && (
        <LeadModal
          apiBaseUrl="/api"
          leadId={leadId}
          onClose={closeModal}
          onUpdated={() => void reload({ keepPage: true })}
        />
      )}

      {createOpen && (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => void reload({ keepPage: true })}
        />
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}
