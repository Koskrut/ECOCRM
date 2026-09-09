"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Inbox, ListChecks, Mail, Pencil, Phone, Search, X } from "lucide-react";
import { companiesApi, type Company } from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import {
  contactsApi,
  type Contact,
  type ContactWorkQueueItem,
  type ContactWorkQueuePreset,
  type ContactWorkQueueSummaryResponse,
} from "@/lib/api/resources/contacts";
import { isTextSelected } from "@/lib/dom";
import { withPreservedScroll } from "@/lib/modal/preserveScroll";
import { formatPhoneDisplay, normalizePhone } from "@/lib/formatPhone";
import {
  ContactsFiltersPopover,
  type ContactsFiltersState,
  type OwnerOption,
} from "./ContactsFiltersPopover";
import { formatDate } from "@/lib/crmDatetime";
import {
  formatContactAddressFromGoogle,
  formatContactPriorityReasonCompact,
} from "./contact-formatters";
import { WorkQueueDesktopRow, WorkQueueMobileCard } from "./WorkQueueList";
import { shouldActivateRowKey } from "./contacts-a11y";
import { isCurrentContactsRequest, shouldShowContactsEmpty } from "./contacts-ui-state";
import {
  buildContactsSearchParams,
  clampContactsPage,
  DEFAULT_CONTACTS_URL,
  isContactsFilterActive,
  isContactsPresetMode,
  parseContactsUrl,
  resolveQueueEmptyAction,
  type ContactsSortBy,
  type ContactsUrlState,
  type ContactsWorkPreset,
} from "./contacts-url";
import { strings } from "@/locales";
import { HelpHint } from "@/components/help/HelpHint";
import { EmptyState } from "@/components/feedback";
import { useListColumns } from "@/lib/lists/useListColumns";
import { renderCellText } from "@/lib/lists/renderCell";
import { useEntityModalStack, type EntityModalFrame } from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";

const PAGE_SIZE = 20;

const WORK_PRESET_VALUES: ContactsWorkPreset[] = [
  "all",
  "attention",
  "overdue",
  "new-no-first-contact",
  "debt-control",
  "return-to-work",
  "risk-or-dormant",
];

function presetLabel(preset: ContactsWorkPreset): string {
  return strings.contacts.presets[preset];
}

function sortLabel(sortBy: ContactsSortBy): string {
  const f = strings.contacts.filters;
  switch (sortBy) {
    case "name":
      return f.sortName;
    case "updatedAt":
      return f.sortUpdatedAt;
    case "hasMissedCall":
      return f.sortMissed;
    case "hasCallToday":
      return f.sortCallToday;
    default:
      return f.sortCreatedAt;
  }
}

function ContactsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = strings.contacts.page;
  const empty = strings.contacts.empty;
  const wq = strings.contacts.workQueue;

  const urlState = useMemo(() => parseContactsUrl(searchParams), [searchParams]);
  const isPresetMode = isContactsPresetMode(urlState);

  const root = useMemo<EntityModalFrame | null>(
    () => (urlState.contactId ? { type: "contact", id: urlState.contactId } : null),
    [urlState.contactId],
  );
  const stack = useEntityModalStack(root);

  const [items, setItems] = useState<Contact[]>([]);
  const [workItems, setWorkItems] = useState<ContactWorkQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [qInput, setQInput] = useState(urlState.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [workSummary, setWorkSummary] = useState<ContactWorkQueueSummaryResponse | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    setQInput(urlState.q);
  }, [urlState.q]);

  const replaceUrl = useCallback(
    (next: ContactsUrlState) => {
      const params = buildContactsSearchParams(next, searchParams);
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (qs !== searchParams.toString()) {
        router.replace(href, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  const patchUrl = useCallback(
    (patch: Partial<ContactsUrlState>) => {
      replaceUrl({ ...urlState, ...patch });
    },
    [replaceUrl, urlState],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const { extraColumns, customValues, loadValuesFor } = useListColumns("CONTACT");

  useEffect(() => {
    if (isPresetMode || items.length === 0) return;
    void loadValuesFor(items.map((c) => c.id));
  }, [isPresetMode, items, loadValuesFor]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      if (nextQ === urlState.q) return;
      patchUrl({ q: nextQ, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput, urlState.q, patchUrl]);

  useEffect(() => {
    companiesApi
      .list()
      .then((r) => {
        setCompanyOptions([
          { value: "", label: strings.contacts.filters.any },
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

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++requestSeq.current;
      const run = async () => {
        try {
          if (!opts?.silent) setLoading(true);
          setError(null);

          const summaryPromise = contactsApi.getWorkQueueSummary({
            q: urlState.q.trim() || undefined,
            ownerId: urlState.ownerId || undefined,
          });

          if (urlState.workPreset === "all") {
            const [res, summary] = await Promise.all([
              contactsApi.list({
                page: urlState.page,
                pageSize: PAGE_SIZE,
                q: urlState.q.trim() || undefined,
                companyId: urlState.companyId || undefined,
                ownerId: urlState.ownerId || undefined,
                hasPhone:
                  urlState.hasPhone === "yes" || urlState.hasPhone === "no"
                    ? urlState.hasPhone
                    : undefined,
                hasEmail:
                  urlState.hasEmail === "yes" || urlState.hasEmail === "no"
                    ? urlState.hasEmail
                    : undefined,
                hasCallToday:
                  urlState.hasCallToday === "yes" || urlState.hasCallToday === "no"
                    ? urlState.hasCallToday
                    : undefined,
                hasMissedCall:
                  urlState.hasMissedCall === "yes" || urlState.hasMissedCall === "no"
                    ? urlState.hasMissedCall
                    : undefined,
                regions: urlState.regions.length > 0 ? urlState.regions : undefined,
                cities: urlState.cities.length > 0 ? urlState.cities : undefined,
                clientType: urlState.clientType.trim() || undefined,
                sortBy: urlState.sortBy,
                sortDir: urlState.sortDir,
              }),
              summaryPromise.catch(() => null),
            ]);
            if (!isCurrentContactsRequest(seq, requestSeq.current)) return;
            setItems(res.items);
            setWorkItems([]);
            setTotal(res.total);
            if (summary) setWorkSummary(summary);
            const clamped = clampContactsPage(urlState.page, res.total, PAGE_SIZE);
            if (clamped !== urlState.page) {
              patchUrl({ page: clamped });
            }
          } else {
            const [queue, summary] = await Promise.all([
              contactsApi.getWorkQueue({
                page: urlState.page,
                pageSize: PAGE_SIZE,
                q: urlState.q.trim() || undefined,
                ownerId: urlState.ownerId || undefined,
                preset: urlState.workPreset,
                reasons: urlState.reasons.length > 0 ? urlState.reasons : undefined,
              }),
              summaryPromise,
            ]);
            if (!isCurrentContactsRequest(seq, requestSeq.current)) return;
            setItems([]);
            setWorkItems(queue.items);
            setTotal(queue.total);
            setWorkSummary(summary);
            const clamped = clampContactsPage(urlState.page, queue.total, PAGE_SIZE);
            if (clamped !== urlState.page) {
              patchUrl({ page: clamped });
            }
          }
        } catch (e) {
          if (!isCurrentContactsRequest(seq, requestSeq.current)) return;
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (e instanceof Error ? e.message : strings.contacts.page.loadError);
          setError(msg);
          setItems([]);
          setWorkItems([]);
        } finally {
          if (isCurrentContactsRequest(seq, requestSeq.current)) setLoading(false);
        }
      };
      if (opts?.silent) await withPreservedScroll(run);
      else await run();
    },
    [urlState, patchUrl],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const openContact = (id: string) => {
    stack.closeAll();
    patchUrl({ contactId: id });
  };

  const openCreate = () => {
    stack.closeAll();
    const params = buildContactsSearchParams({ ...urlState, contactId: "new" }, searchParams);
    if (urlState.companyId) params.set("prefillCompanyId", urlState.companyId);
    const qs = params.toString();
    router.replace(`${pathname}?${qs}`, { scroll: false });
  };

  const contactCreateInitial = useMemo(() => {
    if (urlState.contactId !== "new") return undefined;
    const prefillCompanyId = searchParams.get("prefillCompanyId") ?? searchParams.get("companyId");
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
  }, [urlState.contactId, searchParams]);

  const closeModal = () => {
    stack.closeAll();
    patchUrl({ contactId: "" });
  };

  const closeFrom = (index: number) => {
    if (index <= 0) {
      closeModal();
      return;
    }
    stack.closeFrom(index);
  };

  const replaceRoot = (frame: EntityModalFrame) => {
    if (frame.type !== "contact") return;
    patchUrl({ contactId: frame.id });
  };

  const filtersState: ContactsFiltersState = useMemo(
    () => ({
      companyId: urlState.companyId,
      ownerId: urlState.ownerId,
      hasPhone: urlState.hasPhone,
      hasEmail: urlState.hasEmail,
      hasCallToday: urlState.hasCallToday,
      hasMissedCall: urlState.hasMissedCall,
      regions: urlState.regions,
      cities: urlState.cities,
      clientType: urlState.clientType,
      sortBy: urlState.sortBy,
      sortDir: urlState.sortDir,
      reasons: urlState.reasons,
    }),
    [urlState],
  );

  const applyPopoverFilters = (next: ContactsFiltersState) => {
    if (isPresetMode) {
      patchUrl({
        ownerId: next.ownerId || "",
        reasons: next.reasons ?? [],
        page: 1,
      });
      return;
    }
    patchUrl({
      companyId: next.companyId || "",
      ownerId: next.ownerId || "",
      hasPhone: next.hasPhone || "",
      hasEmail: next.hasEmail || "",
      hasCallToday: next.hasCallToday || "",
      hasMissedCall: next.hasMissedCall || "",
      regions: next.regions ?? [],
      cities: next.cities ?? [],
      clientType: next.clientType || "",
      sortBy:
        next.sortBy === "updatedAt" ||
        next.sortBy === "name" ||
        next.sortBy === "hasCallToday" ||
        next.sortBy === "hasMissedCall"
          ? next.sortBy
          : "createdAt",
      sortDir: next.sortDir === "asc" ? "asc" : "desc",
      reasons: [],
      page: 1,
    });
  };

  const resetAllFilters = () => {
    patchUrl({
      ...DEFAULT_CONTACTS_URL,
      workPreset: urlState.workPreset,
      contactId: urlState.contactId,
      page: 1,
    });
    setQInput("");
  };

  const activeFiltersCount = useMemo(() => {
    if (isPresetMode) {
      return [Boolean(urlState.ownerId), urlState.reasons.length > 0].filter(Boolean).length;
    }
    return [
      Boolean(urlState.companyId),
      Boolean(urlState.ownerId),
      Boolean(urlState.hasPhone),
      Boolean(urlState.hasEmail),
      Boolean(urlState.hasCallToday),
      Boolean(urlState.hasMissedCall),
      urlState.regions.length > 0,
      urlState.cities.length > 0,
      Boolean(urlState.clientType.trim()),
      urlState.sortBy !== "createdAt",
      urlState.sortDir !== "desc",
    ].filter(Boolean).length;
  }, [isPresetMode, urlState]);

  const filtersActive = isContactsFilterActive(urlState);

  const toggleSort = (nextSortBy: ContactsSortBy) => {
    if (urlState.sortBy === nextSortBy) {
      patchUrl({ sortDir: urlState.sortDir === "desc" ? "asc" : "desc", page: 1 });
      return;
    }
    patchUrl({ sortBy: nextSortBy, sortDir: "desc", page: 1 });
  };

  const sortIndicator = (column: ContactsSortBy) =>
    urlState.sortBy === column ? (urlState.sortDir === "desc" ? " ↓" : " ↑") : "";

  const goToPage = (next: number) => {
    patchUrl({ page: next });
  };

  const switchPreset = (preset: ContactsWorkPreset) => {
    if (preset === "all") {
      patchUrl({ workPreset: "all", reasons: [], page: 1 });
      return;
    }
    patchUrl({
      workPreset: preset,
      companyId: "",
      hasPhone: "",
      hasEmail: "",
      hasCallToday: "",
      hasMissedCall: "",
      regions: [],
      cities: [],
      clientType: "",
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
    });
  };

  const companyName =
    companyOptions.find((opt) => opt.value === urlState.companyId)?.label || urlState.companyId;
  const ownerName =
    ownerOptions.find((opt) => opt.id === urlState.ownerId)?.fullName || urlState.ownerId;

  const queueActionKind = resolveQueueEmptyAction({
    ownerId: urlState.ownerId,
    q: urlState.q,
    reasons: urlState.reasons,
  });

  const queueEmptyAction =
    queueActionKind === "openAll" ? (
      <button
        type="button"
        onClick={() => switchPreset("all")}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {empty.queueCtaAll}
      </button>
    ) : queueActionKind === "resetOwner" ? (
      <button
        type="button"
        onClick={() => patchUrl({ ownerId: "", page: 1 })}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {empty.queueCtaResetOwner}
      </button>
    ) : (
      <button
        type="button"
        onClick={resetAllFilters}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {empty.resetFilters}
      </button>
    );

  const allEmptyAction = filtersActive ? (
    <button
      type="button"
      onClick={resetAllFilters}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      {empty.resetFilters}
    </button>
  ) : (
    <button type="button" onClick={openCreate} className="btn-primary">
      {empty.addContact}
    </button>
  );

  const allEmpty = (
    <EmptyState
      icon={Inbox}
      title={filtersActive ? empty.allFilteredTitle : empty.allTitle}
      description={filtersActive ? empty.allFilteredHint : empty.allHint}
      action={allEmptyAction}
    />
  );

  const queueEmpty = (
    <EmptyState
      icon={ListChecks}
      title={empty.queueTitle}
      description={empty.queueHint}
      action={queueEmptyAction}
    />
  );

  const presetCounts = workSummary?.presetCounts;
  const showEmpty = shouldShowContactsEmpty({ loading, error });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{strings.nav.contacts}</h1>
          {isPresetMode ? (
            <p className="mt-1 text-sm text-zinc-500">{strings.contacts.presets.subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <HelpHint routeKey="contacts" />
          <button type="button" onClick={openCreate} className="btn-primary">
            {t.add}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div
          className="mb-3 flex flex-wrap gap-2"
          role="group"
          aria-label={strings.contacts.presets.subtitle}
        >
          {WORK_PRESET_VALUES.map((preset) => {
            const isActive = urlState.workPreset === preset;
            const count =
              preset === "all" ? null : presetCounts?.[preset as ContactWorkQueuePreset];
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={isActive}
                onClick={() => switchPreset(preset)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {presetLabel(preset)}
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
                placeholder={t.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="search"
                aria-label={t.searchAria}
              />
              {qInput ? (
                <button
                  type="button"
                  onClick={() => setQInput("")}
                  className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                  aria-label={t.clearSearch}
                  title={t.clearSearch}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                aria-label={t.openFilters}
                title={t.filters}
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>
            {(urlState.q || activeFiltersCount > 0) && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t.resetAll}
              </button>
            )}
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
        {isPresetMode ? <div className="mt-2 text-xs text-zinc-500">{t.presetHint}</div> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
          {t.totalPage
            .replace("{total}", String(total))
            .replace("{page}", String(urlState.page))
            .replace("{totalPages}", String(totalPages))}
          {activeFiltersCount > 0 ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              {t.filtersActiveCount.replace("{count}", String(activeFiltersCount))}
            </span>
          ) : null}
        </div>
        {(urlState.q || activeFiltersCount > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {urlState.q ? (
              <button
                type="button"
                onClick={() => {
                  setQInput("");
                  patchUrl({ q: "", page: 1 });
                }}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {t.chipSearch.replace("{q}", urlState.q)} ✕
              </button>
            ) : null}
            {!isPresetMode && urlState.companyId ? (
              <button
                type="button"
                onClick={() => patchUrl({ companyId: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {t.chipCompany}: {companyName} ✕
              </button>
            ) : null}
            {urlState.ownerId ? (
              <button
                type="button"
                onClick={() => patchUrl({ ownerId: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {t.chipOwner}: {ownerName} ✕
              </button>
            ) : null}
            {isPresetMode
              ? urlState.reasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() =>
                      patchUrl({
                        reasons: urlState.reasons.filter((item) => item !== reason),
                        page: 1,
                      })
                    }
                    className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                  >
                    {t.chipReason.replace("{value}", formatContactPriorityReasonCompact(reason))} ✕
                  </button>
                ))
              : null}
            {!isPresetMode && urlState.hasPhone ? (
              <button
                type="button"
                onClick={() => patchUrl({ hasPhone: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {urlState.hasPhone === "yes" ? t.chipPhoneYes : t.chipPhoneNo} ✕
              </button>
            ) : null}
            {!isPresetMode && urlState.hasEmail ? (
              <button
                type="button"
                onClick={() => patchUrl({ hasEmail: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {urlState.hasEmail === "yes" ? t.chipEmailYes : t.chipEmailNo} ✕
              </button>
            ) : null}
            {!isPresetMode && urlState.hasCallToday ? (
              <button
                type="button"
                onClick={() => patchUrl({ hasCallToday: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {urlState.hasCallToday === "yes" ? t.chipCallTodayYes : t.chipCallTodayNo} ✕
              </button>
            ) : null}
            {!isPresetMode && urlState.hasMissedCall ? (
              <button
                type="button"
                onClick={() => patchUrl({ hasMissedCall: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {urlState.hasMissedCall === "yes" ? t.chipMissedYes : t.chipMissedNo} ✕
              </button>
            ) : null}
            {!isPresetMode &&
              urlState.regions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() =>
                    patchUrl({
                      regions: urlState.regions.filter((item) => item !== region),
                      page: 1,
                    })
                  }
                  className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  {t.chipRegion.replace("{value}", region)} ✕
                </button>
              ))}
            {!isPresetMode &&
              urlState.cities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() =>
                    patchUrl({
                      cities: urlState.cities.filter((item) => item !== city),
                      page: 1,
                    })
                  }
                  className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  {t.chipCity.replace("{value}", city)} ✕
                </button>
              ))}
            {!isPresetMode && urlState.clientType.trim() ? (
              <button
                type="button"
                onClick={() => patchUrl({ clientType: "", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {t.chipType.replace("{value}", urlState.clientType)} ✕
              </button>
            ) : null}
            {!isPresetMode && (urlState.sortBy !== "createdAt" || urlState.sortDir !== "desc") ? (
              <button
                type="button"
                onClick={() => patchUrl({ sortBy: "createdAt", sortDir: "desc", page: 1 })}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {t.chipSort.replace(
                  "{value}",
                  `${sortLabel(urlState.sortBy)} · ${
                    urlState.sortDir === "asc" ? t.chipSortDirAsc : t.chipSortDirDesc
                  }`,
                )}{" "}
                ✕
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <div className="space-y-1">
            <div className="font-medium">{isPresetMode ? t.loadQueueError : t.loadError}</div>
            <div>{error}</div>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            {t.retry}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-100 md:hidden">
          {loading ? (
            <div className="px-4 py-8 text-center text-zinc-500">
              {isPresetMode ? t.loadingQueue : t.loading}
            </div>
          ) : error ? null : isPresetMode ? (
            workItems.length === 0 ? (
              showEmpty ? (
                <div className="px-4 py-6">{queueEmpty}</div>
              ) : null
            ) : (
              workItems.map((item) => (
                <WorkQueueMobileCard key={item.contact.id} item={item} openContact={openContact} />
              ))
            )
          ) : items.length === 0 ? (
            showEmpty ? (
              <div className="px-4 py-6">{allEmpty}</div>
            ) : null
          ) : (
            items.map((c) => (
              <article
                key={c.id}
                className="bg-white px-3 py-3 transition-all"
                onClick={() => {
                  if (isTextSelected()) return;
                  openContact(c.id);
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
                          {t.debt}
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
                          {t.callToday}
                        </span>
                      )}
                      {c.hasMissedCall && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                          {t.missed}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 flex-col items-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <a
                      href={
                        c.phone
                          ? `tel:${normalizePhone(c.phone) ?? c.phone.replace(/\s/g, "")}`
                          : undefined
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded p-2.5 transition-colors ${c.phone ? "text-zinc-600 hover:bg-emerald-100 hover:text-emerald-700" : "cursor-not-allowed text-zinc-300"}`}
                      title={t.call}
                      aria-label={t.call}
                    >
                      <Phone className="h-5 w-5" />
                    </a>
                    <a
                      href={c.email ? `mailto:${c.email}` : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded p-2.5 transition-colors ${c.email ? "text-zinc-600 hover:bg-blue-100 hover:text-blue-700" : "cursor-not-allowed text-zinc-300"}`}
                      title={t.write}
                      aria-label={t.write}
                    >
                      <Mail className="h-5 w-5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => openContact(c.id)}
                      className="rounded p-2.5 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                      title={t.open}
                      aria-label={t.open}
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          {isPresetMode ? (
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-100/95 text-xs font-medium uppercase text-zinc-500 backdrop-blur supports-[backdrop-filter]:bg-zinc-100/80">
                <tr>
                  <th className="w-[18%] px-3 py-3">{wq.colName}</th>
                  <th className="w-[12%] px-3 py-3">{wq.colOwner}</th>
                  <th className="w-[8%] px-3 py-3 text-right">{wq.colScore}</th>
                  <th className="w-[16%] px-3 py-3">{wq.colReasons}</th>
                  <th className="w-[12%] px-3 py-3">{wq.colStage}</th>
                  <th className="w-[10%] px-3 py-3">{wq.colAction}</th>
                  <th className="w-[10%] px-3 py-3">{wq.colDate}</th>
                  <th className="w-[10%] px-3 py-3">{wq.colLastContact}</th>
                  <th className="w-[8%] px-3 py-3 text-right">{wq.colDebt}</th>
                  <th className="w-[8%] px-2 py-3 text-right">{wq.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                      {t.loadingQueue}
                    </td>
                  </tr>
                ) : error ? null : workItems.length === 0 ? (
                  showEmpty ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10">
                        {queueEmpty}
                      </td>
                    </tr>
                  ) : null
                ) : (
                  workItems.map((item) => (
                    <WorkQueueDesktopRow
                      key={item.contact.id}
                      item={item}
                      openContact={openContact}
                    />
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
                      {t.colName}
                      {sortIndicator("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3">{t.colPhone}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t.colEmail}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t.colAddress}</th>
                  <th className="hidden px-4 py-3 text-right lg:table-cell">
                    <button
                      type="button"
                      onClick={() => toggleSort("hasMissedCall")}
                      className="inline-flex items-center gap-1 hover:text-zinc-700"
                    >
                      {t.colMissed}
                      {sortIndicator("hasMissedCall")}
                    </button>
                  </th>
                  <th className="hidden px-4 py-3 text-right lg:table-cell">
                    <button
                      type="button"
                      onClick={() => toggleSort("hasCallToday")}
                      className="inline-flex items-center gap-1 hover:text-zinc-700"
                    >
                      {t.colCallToday}
                      {sortIndicator("hasCallToday")}
                    </button>
                  </th>
                  <th className="hidden px-4 py-3 lg:table-cell">
                    <button
                      type="button"
                      onClick={() => toggleSort("updatedAt")}
                      className="inline-flex items-center gap-1 hover:text-zinc-700"
                    >
                      {t.colUpdated}
                      {sortIndicator("updatedAt")}
                    </button>
                  </th>
                  {extraColumns.map((col) => (
                    <th key={col.fieldId} className="px-4 py-3">
                      {col.label}
                    </th>
                  ))}
                  <th className="w-28 px-2 py-3 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={8 + extraColumns.length}
                      className="px-4 py-8 text-center text-zinc-500"
                    >
                      {t.loading}
                    </td>
                  </tr>
                ) : error ? null : items.length === 0 ? (
                  showEmpty ? (
                    <tr>
                      <td colSpan={8 + extraColumns.length} className="px-4 py-10">
                        {allEmpty}
                      </td>
                    </tr>
                  ) : null
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
                        if (!shouldActivateRowKey(e)) return;
                        e.preventDefault();
                        openContact(c.id);
                      }}
                    >
                      <td className="px-4 py-4 font-medium text-zinc-900">
                        {c.lastName} {c.firstName}
                        {c.hasDebt && (
                          <span className="ml-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            {t.debt}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-zinc-600">{formatPhoneDisplay(c.phone)}</td>
                      <td className="hidden px-4 py-4 text-zinc-600 md:table-cell">
                        {c.email || "—"}
                      </td>
                      <td className="hidden max-w-[220px] truncate px-4 py-4 text-zinc-600 md:table-cell">
                        {formatContactAddressFromGoogle(c.address)}
                      </td>
                      <td className="hidden px-4 py-4 text-right lg:table-cell">
                        {c.hasMissedCall ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            {t.yes}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">{t.no}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-4 text-right lg:table-cell">
                        {c.hasCallToday ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            {t.yes}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">{t.no}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-4 text-zinc-600 lg:table-cell">
                        {formatDate(c.updatedAt)}
                      </td>
                      {extraColumns.map((col) => (
                        <td key={col.fieldId} className="px-4 py-4 text-zinc-600">
                          {renderCellText(
                            col,
                            c as unknown as Record<string, unknown>,
                            customValues,
                          )}
                        </td>
                      ))}
                      <td
                        className="px-2 py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <a
                            href={
                              c.phone
                                ? `tel:${normalizePhone(c.phone) ?? c.phone.replace(/\s/g, "")}`
                                : undefined
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`rounded p-2 transition-colors ${c.phone ? "text-zinc-600 hover:bg-emerald-100 hover:text-emerald-700" : "cursor-not-allowed text-zinc-300"}`}
                            title={t.call}
                            aria-label={t.call}
                          >
                            <Phone className="h-5 w-5 sm:h-4 sm:w-4" />
                          </a>
                          <a
                            href={c.email ? `mailto:${c.email}` : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`rounded p-2 transition-colors ${c.email ? "text-zinc-600 hover:bg-blue-100 hover:text-blue-700" : "cursor-not-allowed text-zinc-300"}`}
                            title={t.write}
                            aria-label={t.write}
                          >
                            <Mail className="h-5 w-5 sm:h-4 sm:w-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => openContact(c.id)}
                            className="rounded p-2 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                            title={t.open}
                            aria-label={t.open}
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
            {t.pagination
              .replace("{page}", String(urlState.page))
              .replace("{totalPages}", String(totalPages))
              .replace("{total}", String(total))}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={urlState.page <= 1 || loading}
              onClick={() => goToPage(urlState.page - 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              {t.prev}
            </button>
            <button
              type="button"
              disabled={urlState.page >= totalPages || loading}
              onClick={() => goToPage(urlState.page + 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>

      {root ? (
        <EntityModalStackLayers
          frames={stack.frames}
          root={root}
          userRole={userRole}
          onOpen={stack.open}
          onCloseFrom={closeFrom}
          onReplace={stack.replace}
          onReplaceRoot={replaceRoot}
          onUpdate={() => void reload({ silent: true })}
          contactInitialCreate={contactCreateInitial}
        />
      ) : null}
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-zinc-600">{strings.contacts.page.loading}</div>}
    >
      <ContactsPageContent />
    </Suspense>
  );
}
