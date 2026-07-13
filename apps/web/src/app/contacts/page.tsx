"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Mail, Pencil, Phone, Search, X } from "lucide-react";
import { companiesApi, type Company } from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import {
  CONTACT_WORK_QUEUE_PRESETS,
  contactsApi,
  type Contact,
  type ContactsResponse,
  type ContactWorkQueueItem,
  type ContactWorkQueuePreset,
  type ContactWorkQueueSummaryResponse,
} from "@/lib/api/resources/contacts";
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
import {
  formatContactAddressFromGoogle,
  formatContactClientStage,
  formatContactNextActionType,
  formatContactPriorityReasonCompact,
} from "./contact-formatters";
import { strings } from "@/locales";
import { useListColumns } from "@/lib/lists/useListColumns";
import { renderCellText } from "@/lib/lists/renderCell";

const PAGE_SIZE = 20;
type ContactsSortBy = "createdAt" | "updatedAt" | "name" | "hasCallToday" | "hasMissedCall";
type ContactsSortDir = "asc" | "desc";
type ContactsWorkPreset = "all" | ContactWorkQueuePreset;

const WORK_PRESET_OPTIONS: Array<{ value: ContactsWorkPreset; label: string }> = [
  { value: "all", label: "Все контакты" },
  { value: "attention", label: "Требуют внимания" },
  { value: "overdue", label: "Просроченные" },
  { value: "new-no-first-contact", label: "Новые без первого контакта" },
  { value: "debt-control", label: "Контроль оплаты / долг" },
  { value: "return-to-work", label: "Вернуть в работу" },
  { value: "risk-or-dormant", label: "Риск потери / спящие" },
];

function scoreTone(score: number) {
  if (score >= 70) return "border-red-200 bg-red-50 text-red-700";
  if (score >= 40) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function formatDaysSinceLastContact(value: number | null): string {
  if (value == null) return "Без контакта";
  return `${value} дн.`;
}

function WorkQueueMobileCard({
  item,
  openContact,
}: {
  item: ContactWorkQueueItem;
  openContact: (id: string) => void;
}) {
  return (
    <article
      className="bg-white px-3 py-3 transition-all hover:bg-zinc-50/60"
      role="button"
      tabIndex={0}
      onClick={() => {
        if (isTextSelected()) return;
        openContact(item.contact.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openContact(item.contact.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-zinc-900">
              {item.contact.fullName || "Без имени"}
            </div>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scoreTone(item.priorityScore)}`}
            >
              Score {item.priorityScore}
            </span>
            {item.metrics.debtAmount > 0 ? (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Долг {item.metrics.debtAmount}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>Компания: {item.contact.companyName ?? "—"}</span>
            <span>Owner: {item.contact.ownerName ?? "—"}</span>
            <span>Стадия: {formatContactClientStage(item.contact.clientStage)}</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-zinc-600">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">Next action</span>
              <span className="truncate text-right font-medium text-zinc-800">
                {formatContactNextActionType(item.contact.nextActionType)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">Дата</span>
              <span className="text-right">
                {item.contact.nextActionAt ? formatDate(item.contact.nextActionAt) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">Последний контакт</span>
              <span className="text-right">
                {formatDaysSinceLastContact(item.metrics.daysSinceLastContact)}
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {item.priorityReasons.slice(0, 3).map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700"
              >
                {formatContactPriorityReasonCompact(reason)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ContactsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const contactId = searchParams.get("contactId");
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [items, setItems] = useState<Contact[]>([]);
  const [workItems, setWorkItems] = useState<ContactWorkQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState(() => searchParams.get("q") ?? "");
  const [filterCompanyId, setFilterCompanyId] = useState<string | null>(
    () => searchParams.get("companyId") || null,
  );
  const [filterOwnerId, setFilterOwnerId] = useState<string | null>(
    () => searchParams.get("ownerId") || null,
  );
  const [filterHasPhone, setFilterHasPhone] = useState<string>(
    () => searchParams.get("hasPhone") || "",
  );
  const [filterHasEmail, setFilterHasEmail] = useState<string>(
    () => searchParams.get("hasEmail") || "",
  );
  const [filterHasCallToday, setFilterHasCallToday] = useState<string>(
    () => searchParams.get("hasCallToday") || "",
  );
  const [filterHasMissedCall, setFilterHasMissedCall] = useState<string>(
    () => searchParams.get("hasMissedCall") || "",
  );
  const [filterRegions, setFilterRegions] = useState<string[]>(() =>
    searchParams.getAll("region").map((v) => v.trim()).filter(Boolean),
  );
  const [filterCities, setFilterCities] = useState<string[]>(() =>
    searchParams.getAll("city").map((v) => v.trim()).filter(Boolean),
  );
  const [filterClientType, setFilterClientType] = useState<string>(
    () => searchParams.get("clientType") || "",
  );
  const [sortBy, setSortBy] = useState<ContactsSortBy>(() => {
    const raw = searchParams.get("sortBy");
    return raw === "updatedAt" ||
      raw === "name" ||
      raw === "hasCallToday" ||
      raw === "hasMissedCall"
      ? raw
      : "createdAt";
  });
  const [sortDir, setSortDir] = useState<ContactsSortDir>(() =>
    searchParams.get("sortDir") === "asc" ? "asc" : "desc",
  );
  const [workPreset, setWorkPreset] = useState<ContactsWorkPreset>(() => {
    const raw = searchParams.get("workPreset");
    return raw === "all" ||
      raw == null ||
      !CONTACT_WORK_QUEUE_PRESETS.includes(raw as ContactWorkQueuePreset)
      ? "all"
      : (raw as ContactWorkQueuePreset);
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [workSummary, setWorkSummary] = useState<ContactWorkQueueSummaryResponse | null>(null);
  const isPresetMode = workPreset !== "all";

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const { extraColumns, customValues, loadValuesFor } = useListColumns("CONTACT");

  useEffect(() => {
    if (isPresetMode || items.length === 0) return;
    void loadValuesFor(items.map((c) => c.id));
  }, [isPresetMode, items, loadValuesFor]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (contactId) params.set("contactId", contactId);
    if (page > 1) params.set("page", String(page));
    if (q) params.set("q", q);
    if (workPreset !== "all") params.set("workPreset", workPreset);
    if (filterCompanyId && !isPresetMode) params.set("companyId", filterCompanyId);
    if (filterOwnerId) params.set("ownerId", filterOwnerId);
    if (!isPresetMode) {
      if (filterHasPhone) params.set("hasPhone", filterHasPhone);
      if (filterHasEmail) params.set("hasEmail", filterHasEmail);
      if (filterHasCallToday) params.set("hasCallToday", filterHasCallToday);
      if (filterHasMissedCall) params.set("hasMissedCall", filterHasMissedCall);
      filterRegions.forEach((region) => params.append("region", region));
      filterCities.forEach((city) => params.append("city", city));
      if (filterClientType) params.set("clientType", filterClientType);
      if (sortBy !== "createdAt") params.set("sortBy", sortBy);
      if (sortDir !== "desc") params.set("sortDir", sortDir);
    }

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
    filterRegions,
    filterCities,
    filterClientType,
    sortBy,
    sortDir,
    workPreset,
    isPresetMode,
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
        if (workPreset === "all") {
          const res: ContactsResponse = await contactsApi.list({
            page: effectivePage,
            pageSize: PAGE_SIZE,
            q: q.trim() || undefined,
            companyId: filterCompanyId || undefined,
            ownerId: filterOwnerId || undefined,
            hasPhone:
              filterHasPhone === "yes" || filterHasPhone === "no" ? filterHasPhone : undefined,
            hasEmail:
              filterHasEmail === "yes" || filterHasEmail === "no" ? filterHasEmail : undefined,
            hasCallToday:
              filterHasCallToday === "yes" || filterHasCallToday === "no"
                ? filterHasCallToday
                : undefined,
            hasMissedCall:
              filterHasMissedCall === "yes" || filterHasMissedCall === "no"
                ? filterHasMissedCall
                : undefined,
            regions: filterRegions.length > 0 ? filterRegions : undefined,
            cities: filterCities.length > 0 ? filterCities : undefined,
            clientType: filterClientType.trim() || undefined,
            sortBy,
            sortDir,
          });
          setItems(res.items);
          setWorkItems([]);
          setTotal(res.total);
          setWorkSummary(null);
        } else {
          const [queue, summary] = await Promise.all([
            contactsApi.getWorkQueue({
              page: effectivePage,
              pageSize: PAGE_SIZE,
              q: q.trim() || undefined,
              ownerId: filterOwnerId || undefined,
              preset: workPreset,
            }),
            contactsApi.getWorkQueueSummary({
              q: q.trim() || undefined,
              ownerId: filterOwnerId || undefined,
            }),
          ]);
          setItems([]);
          setWorkItems(queue.items);
          setTotal(queue.total);
          setWorkSummary(summary);
        }
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Помилка завантаження контактів");
        setError(msg);
        setItems([]);
        setWorkItems([]);
        setWorkSummary(null);
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
      filterRegions,
      filterCities,
      filterClientType,
      sortBy,
      sortDir,
      workPreset,
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
    if (filterCompanyId) params.set("prefillCompanyId", filterCompanyId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const contactCreateInitial = useMemo(() => {
    if (contactId !== "new") return undefined;
    const prefillCompanyId =
      searchParams.get("prefillCompanyId") ?? searchParams.get("companyId");
    const phone = searchParams.get("phone") ?? undefined;
    const firstName = searchParams.get("firstName") ?? undefined;
    const lastName = searchParams.get("lastName") ?? undefined;
    if (!prefillCompanyId && !phone && !firstName && !lastName) return undefined;
    return {
      companyId: prefillCompanyId || null,
      phone,
      firstName,
      lastName,
    };
  }, [contactId, searchParams]);

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
    setFilterOwnerId(next.ownerId || null);
    if (!isPresetMode) {
      setFilterCompanyId(next.companyId || null);
      setFilterHasPhone(next.hasPhone || "");
      setFilterHasEmail(next.hasEmail || "");
      setFilterHasCallToday(next.hasCallToday || "");
      setFilterHasMissedCall(next.hasMissedCall || "");
      setFilterRegions(next.regions ?? []);
      setFilterCities(next.cities ?? []);
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
    }
    setPage(1);
  };

  const resetAllFilters = () => {
    setFilterCompanyId(null);
    setFilterOwnerId(null);
    setFilterHasPhone("");
    setFilterHasEmail("");
    setFilterHasCallToday("");
    setFilterHasMissedCall("");
    setFilterRegions([]);
    setFilterCities([]);
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
    regions: filterRegions,
    cities: filterCities,
    clientType: filterClientType,
    sortBy,
    sortDir,
  };

  const activeFiltersCount = useMemo(
    () =>
      isPresetMode
        ? [Boolean(filterOwnerId)].filter(Boolean).length
        : [
            Boolean(filterCompanyId),
            Boolean(filterOwnerId),
            Boolean(filterHasPhone),
            Boolean(filterHasEmail),
            Boolean(filterHasCallToday),
            Boolean(filterHasMissedCall),
            filterRegions.length > 0,
            filterCities.length > 0,
            Boolean(filterClientType.trim()),
            sortBy !== "createdAt",
            sortDir !== "desc",
          ].filter(Boolean).length,
    [
      isPresetMode,
      filterCities,
      filterClientType,
      filterCompanyId,
      filterHasEmail,
      filterHasCallToday,
      filterHasPhone,
      filterHasMissedCall,
      filterOwnerId,
      filterRegions,
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

  const presetCounts = workSummary?.presetCounts;
  const switchPreset = (preset: ContactsWorkPreset) => {
    setWorkPreset(preset);
    setPage(1);
    if (preset !== "all") {
      setFilterCompanyId(null);
      setFilterHasPhone("");
      setFilterHasEmail("");
      setFilterHasCallToday("");
      setFilterHasMissedCall("");
      setFilterRegions([]);
      setFilterCities([]);
      setFilterClientType("");
      setSortBy("createdAt");
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{strings.nav.contacts}</h1>
        <button type="button" onClick={openCreate} className="btn-primary">
          + Добавить
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {WORK_PRESET_OPTIONS.map((preset) => {
            const isActive = workPreset === preset.value;
            const count =
              preset.value === "all"
                ? null
                : presetCounts?.[preset.value as ContactWorkQueuePreset];
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => switchPreset(preset.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {preset.label}
                {typeof count === "number" ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
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
                placeholder="имя, телефон, email, компания, адрес, город"
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
            presetMode={isPresetMode}
            onClose={() => setFiltersOpen(false)}
            onApply={applyPopoverFilters}
            onReset={resetAllFilters}
          />
        </div>
        {isPresetMode ? (
          <div className="mt-2 text-xs text-zinc-500">
            В рабочем списке доступны только поиск, ответственный, preset и пагинация.
          </div>
        ) : null}
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
            {!isPresetMode && filterCompanyId ? (
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
            {!isPresetMode && filterHasPhone ? (
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
            {!isPresetMode && filterHasEmail ? (
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
            {!isPresetMode && filterHasCallToday ? (
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
            {!isPresetMode && filterHasMissedCall ? (
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
            {!isPresetMode &&
              filterRegions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => {
                    setFilterRegions((prev) => prev.filter((item) => item !== region));
                    setPage(1);
                  }}
                  className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  Область: {region} ✕
                </button>
              ))}
            {!isPresetMode &&
              filterCities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    setFilterCities((prev) => prev.filter((item) => item !== city));
                    setPage(1);
                  }}
                  className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  Місто: {city} ✕
                </button>
              ))}
            {!isPresetMode && filterClientType.trim() ? (
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
              Скинути все
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <div className="space-y-1">
            <div className="font-medium">
              {isPresetMode
                ? "Не удалось загрузить рабочий список"
                : "Не удалось загрузить контакты"}
            </div>
            <div>{error}</div>
          </div>
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
            <div className="px-4 py-8 text-center text-zinc-500">
              {isPresetMode ? "Формируем рабочий список…" : "Загрузка…"}
            </div>
          ) : isPresetMode ? (
            workItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="text-sm font-medium text-zinc-700">В этом списке сейчас пусто</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Попробуйте другой preset или снимите поиск/фильтр по ответственному.
                </div>
              </div>
            ) : (
              workItems.map((item) => (
                <WorkQueueMobileCard key={item.contact.id} item={item} openContact={openContact} />
              ))
            )
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
                    {c.address ? (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">
                        {formatContactAddressFromGoogle(c.address)}
                      </div>
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
                      href={
                        c.phone
                          ? `tel:${normalizePhone(c.phone) ?? c.phone.replace(/\s/g, "")}`
                          : undefined
                      }
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
          {isPresetMode ? (
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-100/95 text-xs font-medium uppercase text-zinc-500 backdrop-blur supports-[backdrop-filter]:bg-zinc-100/80">
                <tr>
                  <th className="w-[18%] px-3 py-3">Имя</th>
                  <th className="w-[14%] px-3 py-3">Компания</th>
                  <th className="w-[12%] px-3 py-3">Owner</th>
                  <th className="w-[8%] px-3 py-3 text-right">Score</th>
                  <th className="w-[18%] px-3 py-3">Причины</th>
                  <th className="w-[12%] px-3 py-3">Stage</th>
                  <th className="w-[10%] px-3 py-3">Action</th>
                  <th className="w-[10%] px-3 py-3">Дата</th>
                  <th className="w-[10%] px-3 py-3">Контакт</th>
                  <th className="w-[8%] px-3 py-3 text-right">Долг</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                      Формируем рабочий список…
                    </td>
                  </tr>
                ) : workItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center">
                      <div className="text-sm font-medium text-zinc-700">
                        В этом списке сейчас пусто
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Попробуйте другой preset или снимите поиск/фильтр по ответственному.
                      </div>
                    </td>
                  </tr>
                ) : (
                  workItems.map((item) => (
                    <tr
                      key={item.contact.id}
                      className="cursor-pointer align-top transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50"
                      onClick={() => {
                        if (isTextSelected()) return;
                        openContact(item.contact.id);
                      }}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openContact(item.contact.id);
                        }
                      }}
                    >
                      <td className="px-3 py-3.5">
                        <div className="font-medium text-zinc-900">
                          {item.contact.fullName || "Без имени"}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {item.contact.companyName ?? "Без компании"}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-zinc-600">
                        {item.contact.companyName ?? "—"}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-zinc-600">
                        {item.contact.ownerName ?? "—"}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreTone(item.priorityScore)}`}
                        >
                          {item.priorityScore}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {item.priorityReasons.slice(0, 3).map((reason) => (
                            <span
                              key={reason}
                              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium leading-none text-zinc-700"
                            >
                              {formatContactPriorityReasonCompact(reason)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-zinc-600">
                        {formatContactClientStage(item.contact.clientStage)}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-zinc-800">
                        <span className="font-medium">
                          {formatContactNextActionType(item.contact.nextActionType)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-zinc-600">
                        {item.contact.nextActionAt ? formatDate(item.contact.nextActionAt) : "—"}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-zinc-600">
                        {formatDaysSinceLastContact(item.metrics.daysSinceLastContact)}
                      </td>
                      <td className="px-3 py-3.5 text-right text-sm text-zinc-600">
                        {item.metrics.debtAmount > 0 ? (
                          <span className="font-medium text-amber-700">
                            {item.metrics.debtAmount}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
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
                  <th className="hidden px-4 py-3 md:table-cell">Адрес</th>
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
                  {extraColumns.map((col) => (
                    <th key={col.fieldId} className="px-4 py-3">
                      {col.label}
                    </th>
                  ))}
                  <th className="w-28 px-2 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={8 + extraColumns.length} className="px-4 py-8 text-center text-zinc-500">
                      Загрузка…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8 + extraColumns.length} className="px-4 py-8 text-center text-zinc-500">
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
                      <td className="hidden max-w-[220px] truncate px-4 py-4 text-zinc-600 md:table-cell">
                        {formatContactAddressFromGoogle(c.address)}
                      </td>
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
                      {extraColumns.map((col) => (
                        <td key={col.fieldId} className="px-4 py-4 text-zinc-600">
                          {renderCellText(col, c as unknown as Record<string, unknown>, customValues)}
                        </td>
                      ))}
                      <td className="px-2 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <a
                            href={
                              c.phone
                                ? `tel:${normalizePhone(c.phone) ?? c.phone.replace(/\s/g, "")}`
                                : undefined
                            }
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
          )}
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
          initialCreate={contactCreateInitial}
          onClose={closeModal}
          onCreated={openContact}
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
          zIndex={60}
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
