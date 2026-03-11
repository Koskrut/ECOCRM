"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Pencil, Search, Trash2, Users } from "lucide-react";
import { companiesApi, type Company, type CompaniesResponse } from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { ContactModal } from "../contacts/ContactModal";
import { CompanyModal } from "./CompanyModal";
import { CompaniesFiltersPopover } from "./CompaniesFiltersPopover";

const PAGE_SIZE = 20;
const EMPTY = "—";

function CompaniesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const companyId = searchParams.get("companyId");

  const [userRole, setUserRole] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState(() => searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const showOwnerColumn = userRole === "ADMIN" || userRole === "LEAD";
  const colCount = showOwnerColumn ? 4 : 3;

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (page > 1) params.set("page", String(page));
    if (q) params.set("q", q);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [companyId, page, pathname, q, router, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      setPage(1);
      setQ((prev) => (prev === nextQ ? prev : nextQ));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const reload = useCallback(
    async (opts?: { keepPage?: boolean }) => {
      try {
        setLoading(true);
        setError(null);
        const effectivePage = opts?.keepPage ? page : 1;
        if (!opts?.keepPage) setPage(1);

        const res: CompaniesResponse = await companiesApi.list({
          search: q.trim() || undefined,
          page: effectivePage,
          pageSize: PAGE_SIZE,
        });
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Ошибка загрузки компаний");
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [page, q],
  );

  useEffect(() => {
    void reload({ keepPage: true });
  }, [reload]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    if (items.length === 0) return;
    const allSelected = items.every((c) => selectedIds.has(c.id));
    setSelectedIds(allSelected ? new Set() : new Set(items.map((c) => c.id)));
  }, [items, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Удалить выбранные компании (${selectedIds.size})?`)) return;
    setBulkDeleting(true);
    setError(null);
    try {
      await Promise.all([...selectedIds].map((id) => apiHttp.delete(`/companies/${id}`)));
      setSelectedIds(new Set());
      await reload({ keepPage: true });
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Ошибка удаления"),
      );
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, reload]);

  const handleDeleteOne = useCallback(
    async (e: React.MouseEvent, id: string, name: string) => {
      e.stopPropagation();
      if (!confirm(`Удалить компанию «${name}»?`)) return;
      try {
        await apiHttp.delete(`/companies/${id}`);
        await reload({ keepPage: true });
      } catch (err) {
        setError(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (err instanceof Error ? err.message : "Ошибка удаления"),
        );
      }
    },
    [reload],
  );

  const openCompany = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("companyId", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const openCreate = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("companyId", "new");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("companyId");
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl);
  };

  const resetAllFilters = () => {
    setQInput("");
    setQ("");
    setPage(1);
  };

  const goToPage = (next: number) => {
    setPage(next);
    void reload({ keepPage: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Компании</h1>
        <button type="button" onClick={openCreate} className="btn-primary">
          + Добавить
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex items-center gap-2 rounded-xl p-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="название, ЕДРПОУ, ИНН"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="search"
                aria-label="Поиск компаний"
              />
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                aria-label="Открыть фильтры"
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </form>

          <CompaniesFiltersPopover
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            onApply={() => {}}
            onReset={resetAllFilters}
          />
        </div>
        <div className="mt-2 text-sm text-zinc-500">
          Всего: {total} | Страница {page} из {totalPages}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <span className="text-sm font-medium text-zinc-700">
            Выбрано: {selectedIds.size}
          </span>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {bulkDeleting ? "Удаление…" : "Удалить выбранные"}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-sm text-zinc-600 underline hover:text-zinc-900"
          >
            Снять выделение
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((c) => selectedIds.has(c.id))}
                  onChange={selectAllOnPage}
                  className="rounded border-zinc-300"
                  aria-label="Выбрать все на странице"
                />
              </th>
              <th className="px-4 py-3">Название</th>
              {showOwnerColumn && <th className="px-4 py-3">Ответственный</th>}
              <th className="w-24 px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-zinc-500">
                  Загрузка…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-zinc-500">
                  Нет компаний
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  className="group cursor-pointer transition-colors hover:bg-zinc-50"
                  onClick={() => openCompany(c.id)}
                >
                  <td className="w-10 px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelected(c.id)}
                      className="rounded border-zinc-300"
                      aria-label={`Выбрать ${c.name}`}
                    />
                  </td>
                  <td className="px-4 py-4 font-medium text-zinc-900">{c.name}</td>
                  {showOwnerColumn && (
                    <td className="px-4 py-4 text-zinc-600">{c.owner?.fullName ?? EMPTY}</td>
                  )}
                  <td
                    className="px-4 py-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openCompany(c.id)}
                        className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                        title="Открыть"
                        aria-label="Открыть"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <a
                        href={`/contacts?companyId=${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                        title="Контакты компании"
                        aria-label="Контакты компании"
                      >
                        <Users className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteOne(e, c.id, c.name)}
                        className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                        title="Удалить"
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-4">
          <span className="text-xs text-zinc-500">
            Страница {page} из {totalPages} • Всего {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              Вперёд
            </button>
          </div>
        </div>
      </div>

      {companyId && (
        <CompanyModal
          apiBaseUrl="/api"
          companyId={companyId}
          onClose={closeModal}
          onUpdate={() => void reload({ keepPage: true })}
          onOpenContact={(id) => setContactId(id)}
        />
      )}

      {contactId && (
        <ContactModal
          apiBaseUrl="/api"
          contactId={contactId}
          onClose={() => setContactId(null)}
          onUpdate={() => void reload({ keepPage: true })}
          onOpenCompany={(id) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("companyId", id);
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          }}
        />
      )}
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">Загрузка…</div>}>
      <CompaniesPageContent />
    </Suspense>
  );
}
