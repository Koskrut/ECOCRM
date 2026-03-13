"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Mail, Pencil, Phone, Search, X } from "lucide-react";
import { contactsApi, type Contact, type ContactsResponse } from "@/lib/api";
import { companiesApi, type Company } from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { ContactModal } from "./ContactModal";
import { CompanyModal } from "../companies/CompanyModal";
import {
  ContactsFiltersPopover,
  type ContactsFiltersState,
  type OwnerOption,
} from "./ContactsFiltersPopover";

const PAGE_SIZE = 20;

function ContactsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const contactId = searchParams.get("contactId");
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [items, setItems] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState(() => searchParams.get("q") ?? "");
  const [filterCompanyId, setFilterCompanyId] = useState<string | null>(() =>
    searchParams.get("companyId") || null,
  );
  const [filterOwnerId, setFilterOwnerId] = useState<string | null>(() =>
    searchParams.get("ownerId") || null,
  );
  const [filterHasPhone, setFilterHasPhone] = useState<string>(() =>
    searchParams.get("hasPhone") || "",
  );
  const [filterHasEmail, setFilterHasEmail] = useState<string>(() =>
    searchParams.get("hasEmail") || "",
  );
  const [filterRegion, setFilterRegion] = useState<string>(() =>
    searchParams.get("region") || "",
  );
  const [filterCity, setFilterCity] = useState<string>(() => searchParams.get("city") || "");
  const [filterClientType, setFilterClientType] = useState<string>(() =>
    searchParams.get("clientType") || "",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [assignCompanyOpen, setAssignCompanyOpen] = useState(false);
  const groupActionsRef = useRef<HTMLDivElement>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const selectedCount = selectedIds.size;
  const allOnPageSelected = items.length > 0 && items.every((c) => selectedIds.has(c.id));

  useEffect(() => {
    const params = new URLSearchParams();
    if (contactId) params.set("contactId", contactId);
    if (page > 1) params.set("page", String(page));
    if (q) params.set("q", q);
    if (filterCompanyId) params.set("companyId", filterCompanyId);
    if (filterOwnerId) params.set("ownerId", filterOwnerId);
    if (filterHasPhone) params.set("hasPhone", filterHasPhone);
    if (filterHasEmail) params.set("hasEmail", filterHasEmail);
    if (filterRegion) params.set("region", filterRegion);
    if (filterCity) params.set("city", filterCity);
    if (filterClientType) params.set("clientType", filterClientType);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [
    contactId,
    filterCompanyId,
    filterOwnerId,
    filterHasPhone,
    filterHasEmail,
    filterRegion,
    filterCity,
    filterClientType,
    page,
    pathname,
    q,
    router,
    searchParams,
  ]);

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

        const res: ContactsResponse = await contactsApi.list({
          page: effectivePage,
          pageSize: PAGE_SIZE,
          q: q.trim() || undefined,
          companyId: filterCompanyId || undefined,
          ownerId: filterOwnerId || undefined,
          hasPhone: (filterHasPhone === "yes" || filterHasPhone === "no") ? filterHasPhone : undefined,
          hasEmail: (filterHasEmail === "yes" || filterHasEmail === "no") ? filterHasEmail : undefined,
          region: filterRegion.trim() || undefined,
          city: filterCity.trim() || undefined,
          clientType: filterClientType.trim() || undefined,
        });
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Ошибка загрузки контактов");
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [
      page,
      q,
      filterCompanyId,
      filterOwnerId,
      filterHasPhone,
      filterHasEmail,
      filterRegion,
      filterCity,
      filterClientType,
    ],
  );

  useEffect(() => {
    void reload({ keepPage: true });
  }, [reload]);

  useEffect(() => {
    if (!assignCompanyOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (groupActionsRef.current && !groupActionsRef.current.contains(e.target as Node)) {
        setAssignCompanyOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [assignCompanyOpen]);

  useEffect(() => {
    companiesApi
      .list()
      .then((r) => {
        setCompanyOptions([
          { value: "", label: "Все компании" },
          ...r.items.map((c: Company) => ({ value: c.id, label: c.name })),
        ]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ items: OwnerOption[] }>("/users")
      .then((r) => setOwnerOptions(r.data.items ?? []))
      .catch(() => {});
  }, []);

  const openContact = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contactId", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const openCreate = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contactId", "new");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contactId");
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl);
  };

  const openCompany = (id: string) => {
    setCompanyId(id);
  };

  const closeCompanyModal = () => {
    setCompanyId(null);
  };

  const applyPopoverFilters = (next: ContactsFiltersState) => {
    setFilterCompanyId(next.companyId || null);
    setFilterOwnerId(next.ownerId || null);
    setFilterHasPhone(next.hasPhone || "");
    setFilterHasEmail(next.hasEmail || "");
    setFilterRegion(next.region || "");
    setFilterCity(next.city || "");
    setFilterClientType(next.clientType || "");
    setPage(1);
  };

  const resetAllFilters = () => {
    setFilterCompanyId(null);
    setFilterOwnerId(null);
    setFilterHasPhone("");
    setFilterHasEmail("");
    setFilterRegion("");
    setFilterCity("");
    setFilterClientType("");
    setQInput("");
    setQ("");
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const assignSelectedToCompany = async (companyId: string) => {
    if (selectedCount === 0) return;
    setGroupActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => apiHttp.patch(`/contacts/${id}`, { companyId })),
      );
      setAssignCompanyOpen(false);
      clearSelection();
      void reload({ keepPage: true });
    } catch (e) {
      console.error(e);
    } finally {
      setGroupActionLoading(false);
    }
  };

  const unlinkSelectedFromCompany = async () => {
    if (selectedCount === 0) return;
    setGroupActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => apiHttp.patch(`/contacts/${id}`, { companyId: null })),
      );
      clearSelection();
      void reload({ keepPage: true });
    } catch (e) {
      console.error(e);
    } finally {
      setGroupActionLoading(false);
    }
  };

  const filtersState: ContactsFiltersState = {
    companyId: filterCompanyId ?? "",
    ownerId: filterOwnerId ?? "",
    hasPhone: filterHasPhone,
    hasEmail: filterHasEmail,
    region: filterRegion,
    city: filterCity,
    clientType: filterClientType,
  };

  const goToPage = (next: number) => {
    setPage(next);
    void reload({ keepPage: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Контакты</h1>
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
                placeholder="имя, телефон, email"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="search"
                aria-label="Поиск контактов"
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

          <ContactsFiltersPopover
            open={filtersOpen}
            value={filtersState}
            companyOptions={companyOptions}
            ownerOptions={ownerOptions}
            onClose={() => setFiltersOpen(false)}
            onApply={applyPopoverFilters}
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

      {selectedCount > 0 && (
        <div ref={groupActionsRef} className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-900">
            Выбрано: {selectedCount}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                disabled={groupActionLoading}
                onClick={() => setAssignCompanyOpen((v) => !v)}
                className="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
              >
                Привязать к компании
              </button>
              {assignCompanyOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                  {companyOptions
                    .filter((o) => o.value)
                    .map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => assignSelectedToCompany(opt.value)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100"
                      >
                        {opt.label}
                      </button>
                    ))}
                  {companyOptions.filter((o) => o.value).length === 0 && (
                    <div className="px-3 py-2 text-xs text-zinc-500">Нет компаний</div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={groupActionLoading}
              onClick={unlinkSelectedFromCompany}
              className="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              Снять с компании
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="flex items-center gap-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <X className="h-3.5 w-3.5" />
              Снять выделение
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
            <tr>
              <th className="w-10 px-2 py-3">
                <label className="flex cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    className="h-4 w-4 rounded border-zinc-300"
                    aria-label="Выбрать все на странице"
                  />
                </label>
              </th>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right">Звонки</th>
              <th className="w-28 px-2 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Загрузка…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Нет контактов
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  className={`cursor-pointer transition-colors hover:bg-zinc-50 ${selectedIds.has(c.id) ? "bg-blue-50/50" : ""}`}
                  onClick={() => openContact(c.id)}
                >
                  <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                    <label className="flex cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="h-4 w-4 rounded border-zinc-300"
                        aria-label={`Выбрать ${c.firstName} ${c.lastName}`}
                      />
                    </label>
                  </td>
                  <td className="px-4 py-4 font-medium text-zinc-900">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-4 text-zinc-600">{c.phone}</td>
                  <td className="px-4 py-4 text-zinc-600">{c.email || "—"}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      {c.hasCallToday && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Call today
                        </span>
                      )}
                      {c.hasMissedCall && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                          Missed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <a
                        href={c.phone ? `tel:${c.phone.replace(/\s/g, "")}` : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`rounded p-1.5 transition-colors ${c.phone ? "text-zinc-600 hover:bg-emerald-100 hover:text-emerald-700" : "cursor-not-allowed text-zinc-300"}`}
                        title="Позвонить"
                        aria-label="Позвонить"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                      <a
                        href={c.email ? `mailto:${c.email}` : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`rounded p-1.5 transition-colors ${c.email ? "text-zinc-600 hover:bg-blue-100 hover:text-blue-700" : "cursor-not-allowed text-zinc-300"}`}
                        title="Написать"
                        aria-label="Написать"
                      >
                        <Mail className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openContact(c.id);
                        }}
                        className="rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                        title="Открыть"
                        aria-label="Открыть"
                      >
                        <Pencil className="h-4 w-4" />
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

      {contactId && (
        <ContactModal
          apiBaseUrl="/api"
          contactId={contactId}
          onClose={closeModal}
          onOpenCompany={openCompany}
          onUpdate={() => void reload({ keepPage: true })}
        />
      )}

      {companyId && (
        <CompanyModal
          apiBaseUrl="/api"
          companyId={companyId}
          onClose={closeCompanyModal}
          onUpdate={() => {}}
        />
      )}
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">Загрузка…</div>}>
      <ContactsPageContent />
    </Suspense>
  );
}
