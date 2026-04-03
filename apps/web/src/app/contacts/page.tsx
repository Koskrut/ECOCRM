"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Mail, Pencil, Phone, Search, X } from "lucide-react";
import { contactsApi, type Contact, type ContactsResponse } from "@/lib/api";
import { companiesApi, type Company } from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatPhoneDisplay, normalizePhone } from "@/lib/formatPhone";
import { ContactModal } from "./ContactModal";
import { CompanyModal } from "../companies/CompanyModal";
import {
  ContactsFiltersPopover,
  type ContactsFiltersState,
  type OwnerOption,
} from "./ContactsFiltersPopover";
import { formatDate } from "@/lib/crmDatetime";

const PAGE_SIZE = 20;
type ContactsSortBy = "createdAt" | "updatedAt" | "name" | "hasCallToday" | "hasMissedCall";
type ContactsSortDir = "asc" | "desc";

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
  const [filterHasCallToday, setFilterHasCallToday] = useState<string>(() =>
    searchParams.get("hasCallToday") || "",
  );
  const [filterHasMissedCall, setFilterHasMissedCall] = useState<string>(() =>
    searchParams.get("hasMissedCall") || "",
  );
  const [filterRegion, setFilterRegion] = useState<string>(() =>
    searchParams.get("region") || "",
  );
  const [filterCity, setFilterCity] = useState<string>(() => searchParams.get("city") || "");
  const [filterClientType, setFilterClientType] = useState<string>(() =>
    searchParams.get("clientType") || "",
  );
  const [sortBy, setSortBy] = useState<ContactsSortBy>(() => {
    const raw = searchParams.get("sortBy");
    return raw === "updatedAt" || raw === "name" || raw === "hasCallToday" || raw === "hasMissedCall"
      ? raw
      : "createdAt";
  });
  const [sortDir, setSortDir] = useState<ContactsSortDir>(() =>
    searchParams.get("sortDir") === "asc" ? "asc" : "desc",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (contactId) params.set("contactId", contactId);
    if (page > 1) params.set("page", String(page));
    if (q) params.set("q", q);
    if (filterCompanyId) params.set("companyId", filterCompanyId);
    if (filterOwnerId) params.set("ownerId", filterOwnerId);
    if (filterHasPhone) params.set("hasPhone", filterHasPhone);
    if (filterHasEmail) params.set("hasEmail", filterHasEmail);
    if (filterHasCallToday) params.set("hasCallToday", filterHasCallToday);
    if (filterHasMissedCall) params.set("hasMissedCall", filterHasMissedCall);
    if (filterRegion) params.set("region", filterRegion);
    if (filterCity) params.set("city", filterCity);
    if (filterClientType) params.set("clientType", filterClientType);
    if (sortBy !== "createdAt") params.set("sortBy", sortBy);
    if (sortDir !== "desc") params.set("sortDir", sortDir);

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
    filterHasCallToday,
    filterHasMissedCall,
    filterRegion,
    filterCity,
    filterClientType,
    sortBy,
    sortDir,
    page,
    pathname,
    q,
    router,
    searchParams,
  ]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

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
          hasCallToday:
            filterHasCallToday === "yes" || filterHasCallToday === "no"
              ? filterHasCallToday
              : undefined,
          hasMissedCall:
            filterHasMissedCall === "yes" || filterHasMissedCall === "no"
              ? filterHasMissedCall
              : undefined,
          region: filterRegion.trim() || undefined,
          city: filterCity.trim() || undefined,
          clientType: filterClientType.trim() || undefined,
          sortBy,
          sortDir,
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
      filterHasCallToday,
      filterHasMissedCall,
      filterRegion,
      filterCity,
      filterClientType,
      sortBy,
      sortDir,
    ],
  );

  useEffect(() => {
    void reload({ keepPage: true });
  }, [reload]);


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
    setFilterHasCallToday(next.hasCallToday || "");
    setFilterHasMissedCall(next.hasMissedCall || "");
    setFilterRegion(next.region || "");
    setFilterCity(next.city || "");
    setFilterClientType(next.clientType || "");
    setSortBy(
      next.sortBy === "updatedAt" ||
        next.sortBy === "name" ||
        next.sortBy === "hasCallToday" ||
        next.sortBy === "hasMissedCall"
        ? next.sortBy
        : "createdAt",
    );
    setSortDir(next.sortDir === "asc" ? "asc" : "desc");
    setPage(1);
  };

  const resetAllFilters = () => {
    setFilterCompanyId(null);
    setFilterOwnerId(null);
    setFilterHasPhone("");
    setFilterHasEmail("");
    setFilterHasCallToday("");
    setFilterHasMissedCall("");
    setFilterRegion("");
    setFilterCity("");
    setFilterClientType("");
    setSortBy("createdAt");
    setSortDir("desc");
    setQInput("");
    setQ("");
    setPage(1);
  };


  const filtersState: ContactsFiltersState = {
    companyId: filterCompanyId ?? "",
    ownerId: filterOwnerId ?? "",
    hasPhone: filterHasPhone,
    hasEmail: filterHasEmail,
    hasCallToday: filterHasCallToday,
    hasMissedCall: filterHasMissedCall,
    region: filterRegion,
    city: filterCity,
    clientType: filterClientType,
    sortBy,
    sortDir,
  };

  const activeFiltersCount = useMemo(
    () =>
      [
        Boolean(filterCompanyId),
        Boolean(filterOwnerId),
        Boolean(filterHasPhone),
        Boolean(filterHasEmail),
        Boolean(filterHasCallToday),
        Boolean(filterHasMissedCall),
        Boolean(filterRegion.trim()),
        Boolean(filterCity.trim()),
        Boolean(filterClientType.trim()),
        sortBy !== "createdAt",
        sortDir !== "desc",
      ].filter(Boolean).length,
    [
      filterCity,
      filterClientType,
      filterCompanyId,
      filterHasEmail,
      filterHasCallToday,
      filterHasPhone,
      filterHasMissedCall,
      filterOwnerId,
      filterRegion,
      sortBy,
      sortDir,
    ],
  );

  const toggleSort = (nextSortBy: ContactsSortBy) => {
    if (sortBy === nextSortBy) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(nextSortBy);
    setSortDir("desc");
    setPage(1);
  };

  const sortIndicator = (column: ContactsSortBy) =>
    sortBy === column ? (sortDir === "desc" ? " ↓" : " ↑") : "";

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
              {qInput ? (
                <button
                  type="button"
                  onClick={() => setQInput("")}
                  className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                  aria-label="Очистить поиск"
                  title="Очистить"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                aria-label="Открыть фильтры"
                title="Фильтры"
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
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
          Всего: {total} | Страница {page} из {totalPages}
          {activeFiltersCount > 0 ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              Фильтров: {activeFiltersCount}
            </span>
          ) : null}
        </div>
        {(q || activeFiltersCount > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {q ? (
              <button
                type="button"
                onClick={() => {
                  setQInput("");
                  setQ("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Поиск: {q} ✕
              </button>
            ) : null}
            {filterCompanyId ? (
              <button
                type="button"
                onClick={() => {
                  setFilterCompanyId(null);
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Компания ✕
              </button>
            ) : null}
            {filterOwnerId ? (
              <button
                type="button"
                onClick={() => {
                  setFilterOwnerId(null);
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Ответственный ✕
              </button>
            ) : null}
            {filterHasPhone ? (
              <button
                type="button"
                onClick={() => {
                  setFilterHasPhone("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Телефон: {filterHasPhone === "yes" ? "есть" : "нет"} ✕
              </button>
            ) : null}
            {filterHasEmail ? (
              <button
                type="button"
                onClick={() => {
                  setFilterHasEmail("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Email: {filterHasEmail === "yes" ? "есть" : "нет"} ✕
              </button>
            ) : null}
            {filterHasCallToday ? (
              <button
                type="button"
                onClick={() => {
                  setFilterHasCallToday("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Звонок сегодня: {filterHasCallToday === "yes" ? "да" : "нет"} ✕
              </button>
            ) : null}
            {filterHasMissedCall ? (
              <button
                type="button"
                onClick={() => {
                  setFilterHasMissedCall("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Пропущенные: {filterHasMissedCall === "yes" ? "да" : "нет"} ✕
              </button>
            ) : null}
            {filterRegion.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setFilterRegion("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Регион: {filterRegion} ✕
              </button>
            ) : null}
            {filterCity.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setFilterCity("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Город: {filterCity} ✕
              </button>
            ) : null}
            {filterClientType.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setFilterClientType("");
                  setPage(1);
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Тип: {filterClientType} ✕
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetAllFilters}
              className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Сбросить всё
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void reload({ keepPage: true })}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Повторить
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-100 md:hidden">
          {loading ? (
            <div className="px-4 py-8 text-center text-zinc-500">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500">Нет контактов</div>
          ) : (
            items.map((c) => (
              <article
                key={c.id}
                className="bg-white px-3 py-3 transition-all"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isTextSelected()) return;
                  openContact(c.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openContact(c.id);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {c.lastName} {c.firstName}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">{formatPhoneDisplay(c.phone)}</div>
                    {c.hasDebt && (
                      <div className="mt-1">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Борг
                        </span>
                      </div>
                    )}
                    {c.email ? (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{c.email}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
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
                  </div>
                  <div
                    className="flex shrink-0 flex-col items-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                  <a
                    href={c.phone ? `tel:${normalizePhone(c.phone) ?? c.phone.replace(/\s/g, "")}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`rounded p-2.5 transition-colors ${c.phone ? "text-zinc-600 hover:bg-emerald-100 hover:text-emerald-700" : "cursor-not-allowed text-zinc-300"}`}
                    title="Позвонить"
                    aria-label="Позвонить"
                  >
                    <Phone className="h-5 w-5" />
                  </a>
                  <a
                    href={c.email ? `mailto:${c.email}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`rounded p-2.5 transition-colors ${c.email ? "text-zinc-600 hover:bg-blue-100 hover:text-blue-700" : "cursor-not-allowed text-zinc-300"}`}
                    title="Написать"
                    aria-label="Написать"
                  >
                    <Mail className="h-5 w-5" />
                  </a>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100/95 text-xs font-medium uppercase text-zinc-500 backdrop-blur supports-[backdrop-filter]:bg-zinc-100/80">
            <tr>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="inline-flex items-center gap-1 hover:text-zinc-700"
                >
                  Имя{sortIndicator("name")}
                </button>
              </th>
              <th className="px-4 py-3">Телефон</th>
              <th className="hidden px-4 py-3 md:table-cell">Email</th>
              <th className="hidden px-4 py-3 text-right lg:table-cell">
                <button
                  type="button"
                  onClick={() => toggleSort("hasMissedCall")}
                  className="inline-flex items-center gap-1 hover:text-zinc-700"
                >
                  Пропущенные{sortIndicator("hasMissedCall")}
                </button>
              </th>
              <th className="hidden px-4 py-3 text-right lg:table-cell">
                <button
                  type="button"
                  onClick={() => toggleSort("hasCallToday")}
                  className="inline-flex items-center gap-1 hover:text-zinc-700"
                >
                  Звонок сегодня{sortIndicator("hasCallToday")}
                </button>
              </th>
              <th className="hidden px-4 py-3 lg:table-cell">
                <button
                  type="button"
                  onClick={() => toggleSort("updatedAt")}
                  className="inline-flex items-center gap-1 hover:text-zinc-700"
                >
                  Обновлен{sortIndicator("updatedAt")}
                </button>
              </th>
              <th className="w-28 px-2 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Загрузка…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Нет контактов
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50"
                  onClick={() => {
                    if (isTextSelected()) return;
                    openContact(c.id);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openContact(c.id);
                    }
                  }}
                >
                  <td className="px-4 py-4 font-medium text-zinc-900">
                    {c.lastName} {c.firstName}
                    {c.hasDebt && (
                      <span className="ml-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Debt
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-zinc-600">{formatPhoneDisplay(c.phone)}</td>
                  <td className="hidden px-4 py-4 text-zinc-600 md:table-cell">{c.email || "—"}</td>
                  <td className="hidden px-4 py-4 text-right lg:table-cell">
                    {c.hasMissedCall ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">No</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-4 text-right lg:table-cell">
                    {c.hasCallToday ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">No</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-4 text-zinc-600 lg:table-cell">
                    {formatDate(c.updatedAt)}
                  </td>
                  <td className="px-2 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <a
                        href={c.phone ? `tel:${normalizePhone(c.phone) ?? c.phone.replace(/\s/g, "")}` : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`rounded p-2 transition-colors ${c.phone ? "text-zinc-600 hover:bg-emerald-100 hover:text-emerald-700" : "cursor-not-allowed text-zinc-300"}`}
                        title="Позвонить"
                        aria-label="Позвонить"
                      >
                        <Phone className="h-5 w-5 sm:h-4 sm:w-4" />
                      </a>
                      <a
                        href={c.email ? `mailto:${c.email}` : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`rounded p-2 transition-colors ${c.email ? "text-zinc-600 hover:bg-blue-100 hover:text-blue-700" : "cursor-not-allowed text-zinc-300"}`}
                        title="Написать"
                        aria-label="Написать"
                      >
                        <Mail className="h-5 w-5 sm:h-4 sm:w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openContact(c.id);
                        }}
                        className="rounded p-2 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                        title="Открыть"
                        aria-label="Открыть"
                      >
                        <Pencil className="h-5 w-5 sm:h-4 sm:w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

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
          userRole={userRole}
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
