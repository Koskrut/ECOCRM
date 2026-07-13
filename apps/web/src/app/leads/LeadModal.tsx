"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import { LeadStepper, leadStatusToUiStage, type LeadStepperStepDef } from "./LeadStepper";
import { FeedTabsScaffold } from "@/components/modals/FeedTabsScaffold";
import { EntityTasksList } from "@/components/EntityTasksList";
import { EntitySection } from "@/components/sections/EntitySection";
import { SearchableSelectLite, type Option } from "@/components/inputs/SearchableSelectLite";
import { AddressSuggestionsDropdown } from "@/components/inputs/AddressSuggestionsDropdown";
import { apiHttp } from "@/lib/api/client";
import { formatPhoneDisplay, formatPhoneInputMask, normalizePhone } from "@/lib/formatPhone";
import { leadsApi, type Lead, LeadItem, LeadStatus, LeadSource } from "@/lib/api";
import { companiesApi } from "@/lib/api/resources/companies";
import { manualCallingApi } from "@/lib/api/resources/manual-calling";
import { KyivstarDialButton } from "@/components/kyivstar/KyivstarDialButton";
import { ContactTimeline } from "@/app/contacts/ContactTimeline";
import { EntityChangeHistoryPanel } from "@/components/EntityChangeHistoryPanel";
import { UKRAINE_REGIONS } from "@/lib/ukraineRegions";
import { formatDateTime } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import {
  addressHasHouseNumber,
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  mergeFormattedAddressWithUserDetail,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";

type Props = {
  apiBaseUrl: string;
  leadId: string;
  onClose: () => void;
  onUpdated: () => void;
  /** Role from parent (e.g. from /auth/me on page). When set, used for admin actions and internal fetch is skipped. */
  userRole?: string | null;
};

type ActivityItem = {
  id: string;
  type: string;
  title: string | null;
  body: string;
  occurredAt: string | null;
  createdAt: string;
};

type ContactSuggestion = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  companyId?: string | null;
  company?: { name?: string | null } | null;
};

type ContactSearchHit = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  companyId?: string | null;
  company?: { name?: string | null } | null;
};

function formatConvertContactLabel(c: ContactSearchHit | ContactSuggestion): string {
  const name = [c.lastName, c.firstName].filter(Boolean).join(" ").trim() || "—";
  const parts = [formatPhoneDisplay(c.phone), c.email?.trim() || null, c.company?.name?.trim() || null].filter(
    Boolean,
  );
  return parts.length > 0 ? `${name} • ${parts.join(" • ")}` : name;
}

type LeadPipelineUiStepKey = "NEW" | "IN_PROGRESS" | "PROCESSED";

type LeadPipelineApiResponse = {
  stages: Array<{
    status: LeadStatus;
    sortOrder: number;
    label: string;
    color: string | null;
    visible: boolean;
    uiStepKey: LeadPipelineUiStepKey;
    allowedNext: LeadStatus[];
  }>;
  uiSteps: Array<{
    key: LeadPipelineUiStepKey;
    label: string;
    color: "sky" | "amber" | "emerald";
    memberStatuses: LeadStatus[];
  }>;
};

type PublicLeadSourceMetaView = {
  intake: string | null;
  formType: string | null;
  roleSegment: string | null;
  capturedAt: string | null;
  pageUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Bordered, white background — reads as a form field, not plain text */
const LEAD_FIELD_CLASS =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-60";

const LEAD_SOURCE_OPTIONS: Option[] = [
  { id: "META", label: "Meta Lead Ads" },
  { id: "FACEBOOK", label: "Facebook" },
  { id: "TELEGRAM", label: "Telegram" },
  { id: "INSTAGRAM", label: "Instagram" },
  { id: "WEBSITE", label: "Website" },
  { id: "RINGOSTAT", label: "Ringostat" },
  { id: "OTHER", label: "Other" },
];

type GoogleMapsPublicConfig = { mapsApiKey: string | null };

export function LeadModal({ apiBaseUrl, leadId, onClose, onUpdated, userRole: userRoleProp }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showConvertWizard, setShowConvertWizard] = useState(false);
  const [showCompleteOutcomeDialog, setShowCompleteOutcomeDialog] = useState(false);
  /** Preset when opening from outcome dialog: company+contact+deal | contact+deal | contact only */
  const [convertPreset, setConvertPreset] = useState<"company_contact_deal" | "contact_deal" | "contact" | null>(null);
  const [leadTab, setLeadTab] = useState<"main" | "products" | "activity" | "source" | "change-history">("main");

  const [noteMessage, setNoteMessage] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [leadPipelineConfig, setLeadPipelineConfig] = useState<LeadPipelineApiResponse | null>(null);

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editMiddleName, setEditMiddleName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editSource, setEditSource] = useState<LeadSource>("OTHER");
  const [_editStatus, setEditStatus] = useState<LeadStatus>("NEW");

  const [editRegion, setEditRegion] = useState("");
  const [editCity, setEditCity] = useState("");
  const [leadAddress, setLeadAddress] = useState("");
  const [leadLat, setLeadLat] = useState<number | null>(null);
  const [leadLng, setLeadLng] = useState<number | null>(null);
  const [leadGooglePlaceId, setLeadGooglePlaceId] = useState<string | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);
  const [showLeadAddressSuggestions, setShowLeadAddressSuggestions] = useState(false);
  const [leadAddressSuggestions, setLeadAddressSuggestions] = useState<PlaceSuggestion[]>([]);
  const [leadAddressError, setLeadAddressError] = useState<string | null>(null);
  const [leadAddressHint, setLeadAddressHint] = useState<string | null>(null);
  const [isLeadAddressLookupLoading, setIsLeadAddressLookupLoading] = useState(false);
  const leadAddressAbortRef = useRef<AbortController | null>(null);
  const leadAddressAnchorRef = useRef<HTMLDivElement>(null);
  const lastGeocodedLeadAddressRef = useRef<string>("");

  const [timeline, setTimeline] = useState<ActivityItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Convert
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [queueingDialer, setQueueingDialer] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactSearchHits, setContactSearchHits] = useState<ContactSearchHit[]>([]);
  const [loadingContactSearch, setLoadingContactSearch] = useState(false);

  const [companyMode, setCompanyMode] = useState<"link" | "create">("link");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyOptions, setCompanyOptions] = useState<Option[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  const [createContact, setCreateContact] = useState(false);
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactMiddleName, setNewContactMiddleName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");

  const [createDeal, setCreateDeal] = useState(true);
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState<number | undefined>(undefined);
  const [dealComment, setDealComment] = useState("");
  /** Company name when preset is company_contact_deal (create company first, then contact, then order) */
  const [newCompanyName, setNewCompanyName] = useState("");

  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  /** Reorder flow: WON lead already has a contact; create an additional order only. */
  const [reorderMode, setReorderMode] = useState(false);
  /** Owner selected for the conversion order (defaults to lead owner). */
  const [convertOwnerId, setConvertOwnerId] = useState<string | null>(null);
  /** Success state after a conversion that created no order. */
  const [convertDoneNoOrder, setConvertDoneNoOrder] = useState(false);

  // Lead items (local list for editing)
  type EditItem = { productId: string; productName?: string; qty: number; price: number };
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string; sku: string; basePrice: number }>>([]);
  const [_productSearchLoading, setProductSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string; basePrice: number } | null>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [savingItems, setSavingItems] = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [leadHeaderMenuOpen, setLeadHeaderMenuOpen] = useState(false);
  const leadHeaderMenuRef = useRef<HTMLDivElement>(null);

  const [users, setUsers] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const canClose = !saving && !converting && !statusUpdating && !addingNote && !deleting;

  const effectiveRole = userRoleProp ?? userRole;
  const isAdmin = effectiveRole != null && String(effectiveRole).trim().toUpperCase() === "ADMIN";

  const title = useMemo(() => {
    if (!lead) return "Лід";
    return lead.fullName || lead.name || [lead.lastName, lead.firstName, lead.middleName].filter(Boolean).join(" ") || lead.companyName || "Лід";
  }, [lead]);

  const formatDt = (iso: string) => formatDateTime(iso);

  useEffect(() => {
    if (userRoleProp != null) return;
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => {
        const role = res.data?.user?.role ?? null;
        setUserRole(role);
      })
      .catch(() => {
        setUserRole(null);
      });
  }, [userRoleProp]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiHttp.get<{ items: { id: string; fullName: string; email: string }[] }>("/users");
      const loaded = Array.isArray(res.data?.items) ? res.data.items : [];
      setUsers(loaded);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const loadMapsConfig = useCallback(async () => {
    try {
      const res = await apiHttp.get<GoogleMapsPublicConfig>("/settings/google-maps/public");
      const key = res.data?.mapsApiKey ?? null;
      setMapsApiKey(key);
      if (!key) {
        setMapsConfigError("Ключ Google Maps не налаштовано — адресу можна вводити вручну.");
      } else {
        setMapsConfigError(null);
      }
    } catch {
      setMapsApiKey(null);
      setMapsConfigError("Не вдалося завантажити налаштування карт.");
    }
  }, []);

  useEffect(() => {
    void loadMapsConfig();
  }, [loadMapsConfig]);

  const loadLead = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiHttp.get<Lead>(`/leads/${leadId}`);
      const data = r.data as Lead;
      setLead(data);

      setEditFirstName(data.firstName ?? data.name ?? "");
      setEditLastName(data.lastName ?? "");
      setEditMiddleName(data.middleName ?? "");
      setEditPhone(data.phone ? formatPhoneDisplay(data.phone) : "");
      setEditEmail(data.email ?? "");
      setEditCompanyName(data.companyName ?? "");
      setEditMessage(data.message ?? "");
      setEditSource(data.source);
      setEditStatus(data.status);
      setEditRegion(data.region ?? "");
      setEditCity(data.city ?? "");
      setLeadAddress(data.address ?? "");
      setLeadLat(data.lat ?? null);
      setLeadLng(data.lng ?? null);
      setLeadGooglePlaceId(data.googlePlaceId ?? null);

      const items = data.items ?? [];
      setEditItems(
        items.map((it: LeadItem) => ({
          productId: it.productId,
          productName: it.product?.name ?? undefined,
          qty: it.qty,
          price: it.price,
        })),
      );

      setNewContactFirstName(data.firstName ?? data.name ?? "");
      setNewContactLastName(data.lastName ?? "");
      setNewContactMiddleName(data.middleName ?? "");
      setNewContactPhone(data.phone ? formatPhoneDisplay(data.phone) : "");
      setNewContactEmail(data.email ?? "");
    } catch (e) {
      const raw =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося завантажити лід");
      const msg = raw;
      setErr(msg);
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiHttp.get<LeadPipelineApiResponse>("/leads/pipeline");
        if (!cancelled) setLeadPipelineConfig(data);
      } catch {
        if (!cancelled) setLeadPipelineConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const leadStepperSteps = useMemo((): LeadStepperStepDef[] | undefined => {
    if (!leadPipelineConfig?.uiSteps?.length) return undefined;
    return leadPipelineConfig.uiSteps.map((u) => ({
      key: u.key,
      label: u.label,
      color: u.color,
    }));
  }, [leadPipelineConfig]);

  const leadStatusToUiStepMap = useMemo((): Partial<Record<LeadStatus, LeadPipelineUiStepKey>> | null => {
    if (!leadPipelineConfig?.stages?.length) return null;
    const m: Partial<Record<LeadStatus, LeadPipelineUiStepKey>> = {};
    for (const s of leadPipelineConfig.stages) {
      m[s.status] = s.uiStepKey;
    }
    return m;
  }, [leadPipelineConfig]);

  // Product search for adding items
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const r = await fetch(
          `${apiBaseUrl}/products?search=${encodeURIComponent(productSearch)}&page=1&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error("Не вдалося завантажити товари");
        const data = (await r.json()) as { items?: Array<{ id: string; name: string; sku: string; basePrice: number }> };
        if (alive) setProductResults(data.items ?? []);
      } catch {
        if (alive) setProductResults([]);
      } finally {
        if (alive) setProductSearchLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [apiBaseUrl, productSearch]);

  const saveItems = useCallback(async () => {
    if (!lead) return;
    setSavingItems(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}`, {
        items: editItems.map((it) => ({ productId: it.productId, qty: it.qty, price: it.price })),
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося зберегти товари");
      setErr(msg);
    } finally {
      setSavingItems(false);
    }
  }, [lead, editItems, loadLead, onUpdated]);

  const addItemToLead = () => {
    if (!selectedProduct || newItemQty < 1 || newItemPrice < 0) return;
    setEditItems((prev) => [
      ...prev,
      {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        qty: newItemQty,
        price: newItemPrice,
      },
    ]);
    setSelectedProduct(null);
    setProductSearch("");
    setProductResults([]);
    setNewItemQty(1);
    setNewItemPrice(selectedProduct.basePrice);
  };

  const removeItemFromLead = (index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const loadTimeline = useCallback(async () => {
    if (!lead) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const r = await apiHttp.get<{ items: ActivityItem[] }>(
        `/orders/${lead.contactId ?? ""}/activities`,
      );
      setTimeline(Array.isArray(r.data?.items) ? r.data.items : []);
    } catch (e) {
      setTimeline([]);
      setTimelineError(
        e instanceof Error ? e.message : "Не вдалося завантажити активність ліда",
      );
    } finally {
      setTimelineLoading(false);
    }
  }, [lead]);

  const loadSuggestions = useCallback(async (companyId?: string | null) => {
    setSuggestionsLoading(true);
    setSuggestions([]);
    try {
      const params = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const r = await apiHttp.get<{ items: ContactSuggestion[] }>(
        `/leads/${leadId}/suggest-contact${params}`,
      );
      const items = Array.isArray(r.data?.items) ? r.data.items : [];
      setSuggestions(items);
      return items;
    } catch {
      setSuggestions([]);
      return [];
    } finally {
      setSuggestionsLoading(false);
    }
  }, [leadId]);

  const searchCompanies = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setCompanyOptions([]);
      return;
    }
    setLoadingCompanies(true);
    try {
      const res = await companiesApi.list({
        search: q,
        page: 1,
        pageSize: 15,
      });
      setCompanyOptions(
        (res.items ?? []).map((c) => ({
          id: c.id,
          label: c.name,
        })),
      );
    } catch {
      setCompanyOptions([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const searchContacts = useCallback(
    async (query: string, companyId: string | null) => {
      setLoadingContactSearch(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (companyId) params.set("companyId", companyId);
        params.set("page", "1");
        params.set("pageSize", "15");
        const r = await apiHttp.get<{ items?: ContactSearchHit[] }>(`/contacts?${params}`);
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        setContactSearchHits(items);
      } catch {
        setContactSearchHits([]);
      } finally {
        setLoadingContactSearch(false);
      }
    },
    [],
  );

  const onCompanySearchQueryChange = useCallback(
    (q: string) => {
      void searchCompanies(q);
    },
    [searchCompanies],
  );

  const onContactSearchQueryChange = useCallback(
    (q: string) => {
      void searchContacts(q, selectedCompanyId);
    },
    [searchContacts, selectedCompanyId],
  );

  const contactSearchOptions = useMemo(() => {
    const fromSearch = contactSearchHits.map((c) => ({
      id: c.id,
      label: formatConvertContactLabel(c),
    }));
    if (selectedContactId && !fromSearch.some((o) => o.id === selectedContactId)) {
      const fromSuggestion = suggestions.find((c) => c.id === selectedContactId);
      if (fromSuggestion) {
        return [
          {
            id: fromSuggestion.id,
            label: formatConvertContactLabel(fromSuggestion),
          },
          ...fromSearch,
        ];
      }
    }
    return fromSearch;
  }, [contactSearchHits, selectedContactId, suggestions]);

  const selectExistingContact = useCallback(
    (contactId: string, hit?: ContactSearchHit | ContactSuggestion) => {
      setSelectedContactId(contactId);
      setCreateContact(false);
      const companyId =
        hit && "companyId" in hit ? hit.companyId ?? null : null;
      if (companyId) {
        setSelectedCompanyId(companyId);
      }
    },
    [],
  );

  const refreshCompanyContactMatches = useCallback(
    async (companyId: string) => {
      const items = await loadSuggestions(companyId);
      const phoneQuery = lead?.phone?.trim() || lead?.email?.trim() || "";
      if (phoneQuery) {
        await searchContacts(phoneQuery, companyId);
      }
      if (items.length === 1) {
        selectExistingContact(items[0]!.id, items[0]);
        setCreateContact(false);
      } else if (items.length > 0) {
        setCreateContact(false);
      } else {
        setCreateContact(true);
      }
      return items;
    },
    [loadSuggestions, lead?.phone, lead?.email, searchContacts, selectExistingContact],
  );

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  useEffect(() => {
    if (lead) void loadTimeline();
  }, [lead, loadTimeline]);

  const saveGeneral = async () => {
    // Kept for backward compatibility if needed elsewhere, but mostly replaced by patchLead
    if (!lead) return;
    setSaving(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}`, {
        firstName: editFirstName.trim() || null,
        lastName: editLastName.trim() || null,
        middleName: editMiddleName.trim() || null,
        phone:
          normalizePhone(editPhone) ??
          (editPhone.replace(/\D/g, "").length === 0 ? null : editPhone.trim() || null),
        email: editEmail.trim() || null,
        companyName: editCompanyName.trim() || null,
        message: editMessage.trim() || null,
        source: editSource,
        sourceMeta: lead.sourceMeta ?? null,
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося зберегти");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const patchLead = useCallback(
    async (payload: Record<string, any>) => {
      if (!lead) return;
      setSaving(true);
      setErr(null);
      try {
        await apiHttp.patch<Lead>(`/leads/${lead.id}`, payload);
        await loadLead();
        onUpdated();
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Не вдалося зберегти");
        setErr(msg);
        await loadLead(); // rollback on error
      } finally {
        setSaving(false);
      }
    },
    [lead, loadLead, onUpdated]
  );

  const pickLeadAddressSuggestion = useCallback(
    async (s: PlaceSuggestion) => {
      if (!mapsApiKey) return;
      const userTyped = leadAddress.trim();
      setShowLeadAddressSuggestions(false);
      setLeadAddressSuggestions([]);
      setLeadAddressError(null);
      setLeadAddressHint(null);
      lastGeocodedLeadAddressRef.current = "";
      const geo = await geocodePlace(mapsApiKey, s.placeId);
      if (!geo) return;
      const merged = mergeFormattedAddressWithUserDetail(userTyped, geo.formattedAddress);
      setLeadAddress(merged);
      if (!addressHasHouseNumber(merged)) {
        setLeadAddressHint(strings.common.houseNumberHint);
        setLeadLat(null);
        setLeadLng(null);
        setLeadGooglePlaceId(null);
        await patchLead({
          address: merged,
          lat: null,
          lng: null,
          googlePlaceId: null,
        });
        return;
      }
      setLeadLat(geo.lat);
      setLeadLng(geo.lng);
      setLeadGooglePlaceId(geo.placeId);
      lastGeocodedLeadAddressRef.current = merged.trim();
      await patchLead({
        address: merged,
        lat: geo.lat,
        lng: geo.lng,
        googlePlaceId: geo.placeId,
      });
    },
    [mapsApiKey, leadAddress, patchLead],
  );

  const geocodeLeadAddressFromText = useCallback(
    async (rawAddress: string) => {
      const query = rawAddress.trim();
      if (!mapsApiKey || query.length < 3) return;
      if (lastGeocodedLeadAddressRef.current === query) return;
      if (!addressHasHouseNumber(query)) {
        lastGeocodedLeadAddressRef.current = "";
        setLeadAddressHint(strings.common.houseNumberHint);
        setLeadAddressError(null);
        setLeadLat(null);
        setLeadLng(null);
        setLeadGooglePlaceId(null);
        if (query !== (lead?.address ?? "").trim()) {
          await patchLead({
            address: query,
            lat: null,
            lng: null,
            googlePlaceId: null,
          });
        }
        return;
      }
      lastGeocodedLeadAddressRef.current = query;
      setLeadAddressHint(null);
      setLeadAddressError(null);
      try {
        const result = await geocodeText(mapsApiKey, query, { regionCode: "UA" });
        if (!result) return;
        const merged = mergeFormattedAddressWithUserDetail(query, result.formattedAddress || query);
        if (!addressHasHouseNumber(merged)) {
          lastGeocodedLeadAddressRef.current = "";
          setLeadAddress(merged);
          setLeadAddressHint(strings.common.houseNumberHint);
          setLeadLat(null);
          setLeadLng(null);
          setLeadGooglePlaceId(null);
          await patchLead({
            address: merged,
            lat: null,
            lng: null,
            googlePlaceId: null,
          });
          return;
        }
        setLeadAddress(merged);
        setLeadLat(result.lat);
        setLeadLng(result.lng);
        setLeadGooglePlaceId(result.placeId);
        lastGeocodedLeadAddressRef.current = merged.trim();
        await patchLead({
          address: merged,
          lat: result.lat,
          lng: result.lng,
          googlePlaceId: result.placeId,
        });
      } catch {
        // keep typed address
      }
    },
    [lead?.address, mapsApiKey, patchLead],
  );

  useEffect(() => {
    if (!showLeadAddressSuggestions || !mapsApiKey) {
      setLeadAddressSuggestions([]);
      return;
    }
    const query = leadAddress.trim();
    if (query.length < 3) {
      setLeadAddressSuggestions([]);
      return;
    }
    setIsLeadAddressLookupLoading(true);
    const controller = new AbortController();
    leadAddressAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (leadAddressAbortRef.current !== controller) return;
        setLeadAddressSuggestions(suggestions);
      } catch {
        if (leadAddressAbortRef.current !== controller) return;
        setLeadAddressSuggestions([]);
      } finally {
        if (leadAddressAbortRef.current === controller) {
          setIsLeadAddressLookupLoading(false);
        }
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      leadAddressAbortRef.current = null;
    };
  }, [leadAddress, showLeadAddressSuggestions, mapsApiKey]);

  const updateStatus = async (next: LeadStatus, reason?: string) => {
    if (!lead) return;
    setStatusUpdating(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}/status`, {
        status: next,
        reason: reason ?? undefined,
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося оновити статус");
      setErr(msg);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleConvert = async () => {
    if (!lead) return;
    if (convertPreset === "company_contact_deal") {
      if (companyMode === "link" && !selectedCompanyId) {
        setConvertError("Оберіть компанію або увімкніть створення");
        return;
      }
      if (companyMode === "create" && !newCompanyName.trim()) {
        setConvertError("Введіть назву компанії");
        return;
      }
    }
    const hasSelectedContact = !!selectedContactId;
    const mode = hasSelectedContact || !createContact ? "link" : "create";
    if (mode === "link" && !selectedContactId) {
      setConvertError("Оберіть контакт або увімкніть створення контакту");
      return;
    }
    if (mode === "create") {
      const phone = normalizePhone(newContactPhone) ?? (newContactPhone.trim() || lead.phone);
      if (!phone?.trim()) {
        setConvertError("Телефон обовʼязковий для створення контакту");
        return;
      }
      if (!lead.region?.trim()) {
        setConvertError("Оберіть область у картці ліда перед конвертацією");
        return;
      }
    }
    setConverting(true);
    setConvertError(null);
    try {
      const payload: any = {
        contactMode: mode,
        createDeal,
      };

      if (convertPreset === "company_contact_deal") {
        if (companyMode === "link" && selectedCompanyId) {
          payload.companyId = selectedCompanyId;
        } else if (companyMode === "create" && newCompanyName.trim()) {
          payload.createCompany = { name: newCompanyName.trim() };
        }
      } else if (selectedCompanyId) {
        payload.companyId = selectedCompanyId;
      }

      if (mode === "link") {
        payload.contactId = selectedContactId;
      } else {
        payload.contact = {
          firstName: newContactFirstName.trim() || lead.firstName?.trim() || lead.name?.trim() || "Лід",
          lastName:
            newContactLastName.trim() ||
            lead.lastName?.trim() ||
            lead.companyName?.trim() ||
            undefined,
          middleName: newContactMiddleName.trim() || "",
          phone: normalizePhone(newContactPhone) ?? (newContactPhone.trim() || lead.phone),
          email: newContactEmail.trim() || lead.email,
          region: lead.region ?? undefined,
          city: lead.city ?? undefined,
          address: lead.address ?? undefined,
          lat: lead.lat ?? undefined,
          lng: lead.lng ?? undefined,
          googlePlaceId: lead.googlePlaceId ?? undefined,
        };
      }

      if (convertOwnerId) {
        payload.ownerId = convertOwnerId;
      }

      if (createDeal) {
        payload.deal = {
          title: dealTitle.trim() || title,
          amount: typeof dealAmount === "number" ? dealAmount : undefined,
          comment: dealComment.trim() || undefined,
        };
      }

      const res = await apiHttp.post<{ lead: Lead; contact: unknown; deal?: { id?: string; orderNumber?: string } }>(
        `/leads/${lead.id}/convert`,
        payload,
      );
      const dealId = res.data?.deal && typeof res.data.deal === "object" && "id" in res.data.deal
        ? String((res.data.deal as { id: string }).id)
        : null;
      if (dealId) {
        setCreatedOrderId(dealId);
      } else {
        setConvertDoneNoOrder(true);
      }
      await loadLead();
      onUpdated();
      // Keep the wizard open on success without an order so the confirmation is visible.
      if (dealId) setShowConvertWizard(false);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Конвертація не вдалася");
      if (typeof msg === "string" && msg.includes("вже існує")) {
        setConvertError("Контакт з таким телефоном вже є — оберіть його зі списку збігів");
        if (selectedCompanyId) {
          void refreshCompanyContactMatches(selectedCompanyId);
        } else {
          void loadSuggestions();
        }
      } else {
        setConvertError(msg);
      }
    } finally {
      setConverting(false);
    }
  };

  // WON lead without a conversion order: offer to create an (additional) order.
  const canCreateOrderFromWon =
    lead?.status === "WON" && !lead?.convertedOrderId && !lead?.convertedOrder;

  useEffect(() => {
    if (!leadHeaderMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = leadHeaderMenuRef.current;
      const t = e.target;
      if (el && t instanceof Node && !el.contains(t)) setLeadHeaderMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [leadHeaderMenuOpen]);

  const handleEscape = useCallback(() => {
    if (leadHeaderMenuOpen) {
      setLeadHeaderMenuOpen(false);
      return true;
    }
    if (showCompleteOutcomeDialog) {
      setShowCompleteOutcomeDialog(false);
      return true;
    }
    if (showConvertWizard) {
      setShowConvertWizard(false);
      return true;
    }
    return false;
  }, [leadHeaderMenuOpen, showCompleteOutcomeDialog, showConvertWizard]);

  const openCompleteOutcomeDialog = () => {
    setShowCompleteOutcomeDialog(true);
  };

  const openConvertWizard = (preset?: "company_contact_deal" | "contact_deal" | "contact") => {
    setShowCompleteOutcomeDialog(false);
    // Reorder: WON lead already linked to a contact — only create an extra order.
    const isReorder = lead?.status === "WON" && Boolean(lead?.contactId);
    setReorderMode(isReorder);
    setConvertPreset(isReorder ? "contact_deal" : (preset ?? null));
    setNewContactFirstName(lead?.firstName ?? lead?.name ?? "");
    setNewContactLastName(lead?.lastName ?? "");
    setNewContactMiddleName(lead?.middleName ?? "");
    setNewContactPhone(lead?.phone ? formatPhoneDisplay(lead.phone) : "");
    setNewContactEmail(lead?.email ?? "");
    setDealTitle(title);
    setContactSearchHits([]);
    setSelectedCompanyId(null);
    setCompanyOptions([]);
    setConvertOwnerId(lead?.ownerId ?? null);
    if (isReorder) {
      setCompanyMode("link");
      setCreateContact(false);
      setCreateDeal(true);
      setNewCompanyName("");
      setSelectedContactId(lead?.contactId ?? null);
    } else if (preset === "company_contact_deal") {
      setCompanyMode("link");
      setCreateContact(false);
      setCreateDeal(true);
      setNewCompanyName(lead?.companyName ?? "");
      setSelectedContactId(null);
    } else if (preset === "contact_deal") {
      setCompanyMode("link");
      setCreateContact(false);
      setCreateDeal(true);
      setNewCompanyName("");
      setSelectedContactId(null);
    } else if (preset === "contact") {
      setCompanyMode("link");
      setCreateContact(false);
      setCreateDeal(false);
      setNewCompanyName("");
      setSelectedContactId(null);
    } else {
      setCompanyMode("link");
      setNewCompanyName("");
      setSelectedContactId(null);
    }
    setShowConvertWizard(true);
    setCreatedOrderId(null);
    setConvertDoneNoOrder(false);
    setConvertError(null);
    if (!isReorder) void loadSuggestions();
  };

  const markAsPoorQuality = async () => {
    if (!lead) return;
    setShowCompleteOutcomeDialog(false);
    setStatusUpdating(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}/status`, {
        status: "NOT_TARGET",
        reason: "Нецільовий лід",
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося оновити статус");
      setErr(msg);
    } finally {
      setStatusUpdating(false);
    }
  };

  const addNote = async () => {
    if (!lead || !noteMessage.trim()) return;
    setAddingNote(true);
    setErr(null);
    try {
      await leadsApi.addNote(lead.id, { message: noteMessage.trim() });
      setNoteMessage("");
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося додати нотатку");
      setErr(msg);
    } finally {
      setAddingNote(false);
    }
  };

  const publicSourceMeta = useMemo<PublicLeadSourceMetaView | null>(() => {
    if (!lead?.sourceMeta) return null;
    const root = asRecord(lead.sourceMeta);
    if (!root) return null;
    const attr = asRecord(root.attribution);
    const from = (obj: Record<string, unknown> | null, key: string): string | null => {
      const v = obj?.[key];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const result: PublicLeadSourceMetaView = {
      intake: from(root, "intake"),
      formType: from(root, "formType"),
      roleSegment: from(root, "roleSegment"),
      capturedAt: from(root, "capturedAt"),
      pageUrl: from(attr, "pageUrl"),
      referrer: from(attr, "referrer"),
      utmSource: from(attr, "utmSource"),
      utmMedium: from(attr, "utmMedium"),
      utmCampaign: from(attr, "utmCampaign"),
      utmContent: from(attr, "utmContent"),
      utmTerm: from(attr, "utmTerm"),
      gclid: from(attr, "gclid"),
      fbclid: from(attr, "fbclid"),
    };
    const hasAny = Object.values(result).some(Boolean);
    return hasAny ? result : null;
  }, [lead?.sourceMeta]);

  const responsibleOptions = useMemo<Option[]>(() => {
    const base = users.map((u) => ({
      id: u.id,
      label: u.fullName?.trim() || u.email,
    }));
    const own = lead?.owner;
    if (own?.id && !base.some((o) => o.id === own.id)) {
      return [{ id: own.id, label: own.fullName }, ...base];
    }
    return base;
  }, [users, lead?.owner]);

  const leftContent = loading ? (
    <div className="space-y-6" aria-hidden>
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
              <div className="h-9 w-full animate-pulse rounded-md bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
        <div className="h-24 w-full animate-pulse rounded-md bg-zinc-100" />
      </div>
    </div>
  ) : err ? (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
  ) : !lead ? (
    <div className="text-sm text-zinc-500">Лід не знайдено</div>
  ) : leadTab === "source" ? (
    <div className="space-y-6">
      {lead.attribution ? (
        <EntitySection title="Атрибуція">
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-sm">
            <div className="grid gap-2 text-zinc-700">
              <div><span className="text-zinc-500">Кампанія:</span> {lead.attribution.campaignName} ({lead.attribution.campaignId})</div>
              <div><span className="text-zinc-500">Група оголошень:</span> {lead.attribution.adsetName} ({lead.attribution.adsetId})</div>
              <div><span className="text-zinc-500">Оголошення:</span> {lead.attribution.adName} ({lead.attribution.adId})</div>
              <div><span className="text-zinc-500">Форма:</span> {lead.attribution.formId}</div>
              <div><span className="text-zinc-500">Створено (Meta):</span> {formatDateTime(lead.attribution.createdTime)}</div>
            </div>
          </div>
        </EntitySection>
      ) : null}
      {publicSourceMeta ? (
        <EntitySection title="Публічна атрибуція ліда">
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-sm">
            <div className="grid gap-2 text-zinc-700">
              <div><span className="text-zinc-500">Джерело:</span> {publicSourceMeta.intake ?? "—"}</div>
              <div><span className="text-zinc-500">Тип форми:</span> {publicSourceMeta.formType ?? "—"}</div>
              <div><span className="text-zinc-500">Сегмент ролі:</span> {publicSourceMeta.roleSegment ?? "—"}</div>
              <div><span className="text-zinc-500">Зафіксовано:</span> {publicSourceMeta.capturedAt ? formatDateTime(publicSourceMeta.capturedAt) : "—"}</div>
              <div><span className="text-zinc-500">utm_source:</span> {publicSourceMeta.utmSource ?? "—"}</div>
              <div><span className="text-zinc-500">utm_medium:</span> {publicSourceMeta.utmMedium ?? "—"}</div>
              <div><span className="text-zinc-500">utm_campaign:</span> {publicSourceMeta.utmCampaign ?? "—"}</div>
              <div><span className="text-zinc-500">utm_content:</span> {publicSourceMeta.utmContent ?? "—"}</div>
              <div><span className="text-zinc-500">utm_term:</span> {publicSourceMeta.utmTerm ?? "—"}</div>
              <div><span className="text-zinc-500">gclid:</span> {publicSourceMeta.gclid ?? "—"}</div>
              <div><span className="text-zinc-500">fbclid:</span> {publicSourceMeta.fbclid ?? "—"}</div>
              <div className="break-all"><span className="text-zinc-500">URL сторінки:</span> {publicSourceMeta.pageUrl ?? "—"}</div>
              <div className="break-all"><span className="text-zinc-500">Реферер:</span> {publicSourceMeta.referrer ?? "—"}</div>
            </div>
          </div>
        </EntitySection>
      ) : null}
      {lead.answers && lead.answers.length > 0 ? (
        <EntitySection title="Відповіді форми">
          <div className="rounded-md border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {lead.answers.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-zinc-500 font-medium w-1/3">{a.key}</td>
                    <td className="px-3 py-2 text-zinc-900">{a.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EntitySection>
      ) : null}
      {lead.events && lead.events.length > 0 ? (
        <EntitySection title="Події">
          <div className="space-y-2">
            {lead.events.map((e) => (
              <div key={e.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-zinc-900">{e.type}</span>
                  <span className="text-xs text-zinc-500">{formatDateTime(e.createdAt)}</span>
                </div>
                <div className="mt-1 text-zinc-700">{e.message}</div>
              </div>
            ))}
          </div>
        </EntitySection>
      ) : null}
      {!lead.attribution && !publicSourceMeta && (!lead.answers || lead.answers.length === 0) && (!lead.events || lead.events.length === 0) ? (
        <div className="text-sm text-zinc-500">Немає даних про джерело</div>
      ) : null}
    </div>
  ) : leadTab === "change-history" ? (
    <EntitySection title="Історія змін">
      <EntityChangeHistoryPanel entityType="Lead" entityId={lead.id} />
    </EntitySection>
  ) : leadTab === "activity" ? (
    <EntitySection title="Активність">
      <div className="h-[420px]">
        <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={lead?.contactId || lead.id} entityType={lead?.contactId ? "contact" : "lead"} showActivityButtons={true} />
      </div>
    </EntitySection>
  ) : leadTab === "products" ? (
    <EntitySection title="Товари">
      <div className="rounded-md border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="px-3 py-2 text-left">Товар</th>
              <th className="px-3 py-2 text-right">К-сть</th>
              <th className="px-3 py-2 text-right">Ціна</th>
              <th className="px-3 py-2 text-right">Разом</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {editItems.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                  Немає товарів
                </td>
              </tr>
            ) : (
              editItems.map((it, idx) => (
                <tr key={`${it.productId}-${idx}`}>
                  <td className="px-3 py-2">{it.productName ?? it.productId}</td>
                  <td className="px-3 py-2 text-right">{it.qty}</td>
                  <td className="px-3 py-2 text-right">{it.price.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium">{(it.qty * it.price).toFixed(2)}</td>
                  <td className="px-1 py-2">
                    <button
                      type="button"
                      onClick={() => removeItemFromLead(idx)}
                      className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
                      disabled={savingItems}
                    >
                      Видалити
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px]">
          <input
            type="text"
            placeholder="Пошук товару…"
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            disabled={savingItems}
          />
          {productResults.length > 0 ? (
            <ul className="mt-1 max-h-32 overflow-auto rounded border border-zinc-200 bg-white shadow">
              {productResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-50 flex justify-between"
                    onClick={() => {
                      setSelectedProduct(p);
                      setProductSearch(p.name);
                      setProductResults([]);
                      setNewItemPrice(p.basePrice);
                    }}
                  >
                    <span>{p.name}</span>
                    <span className="text-zinc-500 text-xs">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="w-16">
          <label className="block text-[10px] text-zinc-500">К-сть</label>
          <input
            type="number"
            min={1}
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={newItemQty}
            onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={savingItems}
          />
        </div>
        <div className="w-24">
          <label className="block text-[10px] text-zinc-500">Ціна</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={newItemPrice}
            onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
            disabled={savingItems}
          />
        </div>
        <button
          type="button"
          onClick={addItemToLead}
          disabled={!selectedProduct || savingItems}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Додати
        </button>
        <button
          type="button"
          onClick={() => void saveItems()}
          disabled={savingItems || editItems.length === 0}
          className="btn-primary py-1.5"
        >
          {savingItems ? "Збереження…" : "Зберегти товари"}
        </button>
      </div>
    </EntitySection>
  ) : (
    <div className="space-y-6">
      {/* Contact */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Контакт</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-first-name">
              Ім'я
            </label>
            <input
              id="lead-first-name"
              autoComplete="given-name"
              className={LEAD_FIELD_CLASS}
              placeholder="Введіть ім'я..."
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              onBlur={() => {
                if (editFirstName !== (lead.firstName ?? lead.name ?? "")) {
                  void patchLead({ firstName: editFirstName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-last-name">
              Прізвище
            </label>
            <input
              id="lead-last-name"
              autoComplete="family-name"
              className={LEAD_FIELD_CLASS}
              placeholder="Введіть прізвище..."
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              onBlur={() => {
                if (editLastName !== (lead.lastName ?? "")) {
                  void patchLead({ lastName: editLastName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-middle-name">
              По батькові
            </label>
            <input
              id="lead-middle-name"
              className={LEAD_FIELD_CLASS}
              placeholder="Введіть по батькові..."
              value={editMiddleName}
              onChange={(e) => setEditMiddleName(e.target.value)}
              onBlur={() => {
                if (editMiddleName !== (lead.middleName ?? "")) {
                  void patchLead({ middleName: editMiddleName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-phone">
              Телефон
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="lead-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={`${LEAD_FIELD_CLASS} min-w-[12rem] flex-1`}
                placeholder="+38 (0__) ___-__-__"
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhoneInputMask(e.target.value))}
                onBlur={() => {
                  const prev = normalizePhone(lead.phone ?? "") ?? lead.phone ?? null;
                  const next = normalizePhone(editPhone);
                  const empty = editPhone.replace(/\D/g, "").length === 0;
                  if (empty) {
                    if (prev) void patchLead({ phone: null });
                    return;
                  }
                  if (next && next !== prev) {
                    void patchLead({ phone: next });
                  }
                }}
                disabled={saving}
              />
              {lead.phone ? <KyivstarDialButton phone={lead.phone} size="md" /> : null}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-email">
              Email
            </label>
            <input
              id="lead-email"
              type="email"
              autoComplete="email"
              className={LEAD_FIELD_CLASS}
              placeholder="Введіть email..."
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              onBlur={() => {
                if (editEmail !== (lead.email ?? "")) {
                  void patchLead({ email: editEmail.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
        </div>
        {!lead.phone && !lead.email && (
          <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
            Запросити контакт у ліда
          </p>
        )}
      </section>

      {/* Conversion order (canonical traceability; not the same as WON alone) */}
      {(lead.convertedOrderId || lead.convertedOrder) && (
        <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Замовлення конверсії</h3>
          <p className="text-xs text-emerald-900/80">
            Прив’язка з CRM-конверсії ліда (convertedOrderId). Окремо від статусу WON.
          </p>
          <Link
            href={`/orders?orderId=${encodeURIComponent(lead.convertedOrder?.id ?? lead.convertedOrderId ?? "")}`}
            className="inline-flex text-sm font-medium text-emerald-800 underline decoration-emerald-400 underline-offset-2 hover:text-emerald-950"
          >
            Відкрити замовлення {lead.convertedOrder?.orderNumber ? `№${lead.convertedOrder.orderNumber}` : ""}
          </Link>
        </section>
      )}
      {lead.status === "WON" && !lead.convertedOrderId && !lead.convertedOrder && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Статус WON без прив’язаного замовлення: можливо лише контакт або лід до оновлення зв’язку. Окремого замовлення
          конверсії в CRM не зафіксовано.
        </p>
      )}

      {/* Company & source */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Компанія та джерело</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-company">
              Компанія клієнта
            </label>
            <input
              id="lead-company"
              autoComplete="off"
              className={LEAD_FIELD_CLASS}
              placeholder="Введіть компанію..."
              value={editCompanyName}
              onChange={(e) => setEditCompanyName(e.target.value)}
              onBlur={() => {
                if (editCompanyName !== (lead.companyName ?? "")) {
                  void patchLead({ companyName: editCompanyName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-700">Джерело</span>
            <SearchableSelectLite
              value={editSource}
              options={LEAD_SOURCE_OPTIONS}
              placeholder="Оберіть джерело…"
              disabled={saving}
              onChange={async (id) => {
                if (!id) return;
                const val = id as LeadSource;
                setEditSource(val);
                if (val !== lead.source) {
                  await patchLead({ source: val });
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700" htmlFor="lead-region">
              Область
            </label>
            <select
              id="lead-region"
              className={`${LEAD_FIELD_CLASS} cursor-pointer`}
              value={editRegion}
              onChange={(e) => {
                const v = e.target.value;
                setEditRegion(v);
                void patchLead({ region: v || null });
              }}
              disabled={saving}
            >
              <option value="">— Оберіть область —</option>
              {UKRAINE_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-700">Відповідальний</span>
            <SearchableSelectLite
              value={lead.ownerId ?? ""}
              options={responsibleOptions}
              placeholder="Оберіть відповідального…"
              disabled={saving || loadingUsers}
              isLoading={loadingUsers}
              onChange={async (id) => {
                const next = id || null;
                if (next === (lead.ownerId ?? null)) return;
                await patchLead({ ownerId: next });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="lead-city" className="text-xs font-medium text-zinc-700">
              Населений пункт
            </label>
            <input
              id="lead-city"
              type="text"
              className={LEAD_FIELD_CLASS}
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              onBlur={() => {
                const t = editCity.trim();
                if (t === (lead.city ?? "").trim()) return;
                void patchLead({ city: t || null, npCityRef: null });
              }}
              placeholder="Назва міста / села…"
              disabled={saving}
              autoComplete="address-level2"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-zinc-700">Адреса (Google Maps)</span>
            {mapsConfigError ? <p className="text-xs text-amber-800">{mapsConfigError}</p> : null}
            <div ref={leadAddressAnchorRef} className="relative">
              <input
                className={LEAD_FIELD_CLASS}
                value={leadAddress}
                onChange={(e) => {
                  setLeadAddress(e.target.value);
                  setLeadAddressError(null);
                  setLeadAddressHint(null);
                  lastGeocodedLeadAddressRef.current = "";
                  setShowLeadAddressSuggestions(true);
                }}
                onFocus={() => setShowLeadAddressSuggestions(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowLeadAddressSuggestions(false), 200);
                  const t = leadAddress.trim();
                  if (t === (lead.address ?? "").trim() && lastGeocodedLeadAddressRef.current === t) return;
                  if (t.length >= 3 && mapsApiKey) {
                    void geocodeLeadAddressFromText(t);
                    return;
                  }
                  if (t && !addressHasHouseNumber(t)) {
                    setLeadAddressHint(strings.common.houseNumberHint);
                    setLeadLat(null);
                    setLeadLng(null);
                    setLeadGooglePlaceId(null);
                    void patchLead({
                      address: t,
                      lat: null,
                      lng: null,
                      googlePlaceId: null,
                    });
                    return;
                  }
                  setLeadAddressHint(null);
                  void patchLead({ address: t || null });
                }}
                placeholder="Введіть адресу…"
                disabled={saving}
                autoComplete="street-address"
              />
              {isLeadAddressLookupLoading && mapsApiKey ? (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                  …
                </span>
              ) : null}
              <AddressSuggestionsDropdown
                open={showLeadAddressSuggestions}
                anchorRef={leadAddressAnchorRef}
                suggestions={leadAddressSuggestions}
                onSelect={(s) => void pickLeadAddressSuggestion(s)}
              />
            </div>
            {leadAddressHint ? (
              <p className="text-xs text-amber-700">{leadAddressHint}</p>
            ) : null}
            {leadAddressError ? (
              <p className="text-xs text-red-600">{leadAddressError}</p>
            ) : null}
            {leadLat != null && leadLng != null ? (
              <p className="text-xs text-zinc-500">
                Координати: {leadLat.toFixed(5)}, {leadLng.toFixed(5)}
              </p>
            ) : null}
          </div>
          {lead.score != null ? (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <span className="text-xs text-zinc-500">Оцінка:</span>
              <span
                className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  lead.score >= 70
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : lead.score >= 40
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-zinc-200 bg-zinc-100 text-zinc-600"
                }`}
              >
                {lead.score}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Message */}
      <section className="space-y-3">
        <h3 id="lead-message-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Повідомлення
        </h3>
        <textarea
          id="lead-message"
          aria-labelledby="lead-message-heading"
          rows={3}
          className={`${LEAD_FIELD_CLASS} min-h-[4.5rem] resize-none`}
          placeholder="Повідомлення або коментар від ліда..."
          value={editMessage}
          onChange={(e) => {
            setEditMessage(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={() => {
            if (editMessage !== (lead.message ?? "")) {
              void patchLead({ message: editMessage.trim() || null });
            }
          }}
          disabled={saving}
        />
      </section>

      <div className="border-t border-zinc-100 pt-4">
        <span className="text-xs text-zinc-400">
          Створено: {formatDateTime(lead.createdAt)}
          {lead.lastActivityAt && ` · Активність: ${formatDateTime(lead.lastActivityAt)}`}
        </span>
      </div>

      {/* Add note */}
      <section className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Додати нотатку</h3>
        <textarea
          rows={2}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/30 disabled:bg-zinc-50"
          placeholder="Введіть текст нотатки…"
          value={noteMessage}
          onChange={(e) => setNoteMessage(e.target.value)}
          disabled={addingNote}
        />
        <button
          type="button"
          onClick={() => void addNote()}
          disabled={addingNote || !noteMessage.trim()}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {addingNote ? "Надсилання…" : "Додати нотатку"}
        </button>
      </section>

      {lead.statusReason ? (
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">Причина статусу:</span> {lead.statusReason}
        </p>
      ) : null}
    </div>
  );

  const rightContent = showConvertWizard ? (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              {convertPreset === "company_contact_deal" && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="font-medium text-zinc-900">Крок 1. Компанія</div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Оберіть існуючу компанію або створіть нову; контакт і замовлення будуть привʼязані до неї.
                  </p>
                  <div className="mt-3 flex gap-3 text-xs">
                    <label className="flex items-center gap-1.5 text-zinc-700">
                      <input
                        type="radio"
                        name="companyMode"
                        checked={companyMode === "link"}
                        onChange={() => {
                          setCompanyMode("link");
                          setNewCompanyName("");
                        }}
                      />
                      Обрати існуючу
                    </label>
                    <label className="flex items-center gap-1.5 text-zinc-700">
                      <input
                        type="radio"
                        name="companyMode"
                        checked={companyMode === "create"}
                        onChange={() => {
                          setCompanyMode("create");
                          setSelectedCompanyId(null);
                          setCompanyOptions([]);
                        }}
                      />
                      Створити нову
                    </label>
                  </div>
                  {companyMode === "link" ? (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-zinc-600">Компанія</label>
                      <div className="mt-1">
                        <SearchableSelectLite
                          value={selectedCompanyId}
                          options={companyOptions}
                          placeholder="Пошук компанії (мін. 2 символи)…"
                          disabled={converting}
                          isLoading={loadingCompanies}
                          onSearchQueryChange={onCompanySearchQueryChange}
                          onChange={(id) => {
                            setSelectedCompanyId(id);
                            setSelectedContactId(null);
                            setContactSearchHits([]);
                            if (id) {
                              void refreshCompanyContactMatches(id);
                            } else {
                              setCreateContact(false);
                              void loadSuggestions();
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-zinc-600">Назва компанії</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
                        placeholder="Назва компанії"
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              {reorderMode && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  Лід уже конвертовано. Замовлення буде привʼязане до наявного контакту ліда.
                </div>
              )}
              {!reorderMode && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">
                    {convertPreset === "company_contact_deal" ? "Крок 2. Контакт" : "Крок 1. Контакт"}
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadSuggestions(selectedCompanyId)}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                  >
                    Оновити пошук
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {suggestionsLoading ? (
                    <div className="text-xs text-zinc-500">Пошук контактів…</div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-xs text-zinc-500">
                      Автоматичних збігів немає — знайдіть контакт вручну або створіть новий.
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-zinc-500">Можливі збіги:</div>
                      <div className="space-y-1">
                        {suggestions.map((c) => {
                          const active = selectedContactId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                selectExistingContact(c.id, c);
                              }}
                              className={`w-full rounded-md border px-3 py-2 text-left text-xs ${
                                active
                                  ? "border-zinc-900 bg-zinc-900/5"
                                  : "border-zinc-200 hover:bg-white"
                              }`}
                            >
                              <div className="font-medium text-zinc-900">
                                {c.lastName} {c.firstName}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {formatPhoneDisplay(c.phone)} {c.email ? `• ${c.email}` : ""}
                                {c.company?.name ? ` • ${c.company.name}` : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-zinc-600">Знайти контакт</label>
                  <div className="mt-1">
                    <SearchableSelectLite
                      value={selectedContactId}
                      options={contactSearchOptions}
                      placeholder="Пошук за імʼям, телефоном, email…"
                      disabled={converting || (createContact && convertPreset !== "company_contact_deal")}
                      isLoading={loadingContactSearch}
                      onSearchQueryChange={onContactSearchQueryChange}
                      onChange={(id) => {
                        if (!id) {
                          setSelectedContactId(null);
                          return;
                        }
                        const hit = contactSearchHits.find((c) => c.id === id);
                        selectExistingContact(id, hit);
                      }}
                    />
                  </div>
                </div>

                {convertPreset !== "company_contact_deal" && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      id="createContact"
                      type="checkbox"
                      checked={createContact}
                      onChange={(e) => {
                        setCreateContact(e.target.checked);
                        if (e.target.checked) {
                          setSelectedContactId(null);
                          setContactSearchHits([]);
                        }
                      }}
                    />
                    <label htmlFor="createContact" className="text-xs text-zinc-700">
                      Створити новий контакт замість привʼязки
                    </label>
                  </div>
                )}

                {createContact && !selectedContactId && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Ім'я
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactFirstName}
                        onChange={(e) => setNewContactFirstName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Прізвище
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactLastName}
                        onChange={(e) => setNewContactLastName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        По батькові
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactMiddleName}
                        onChange={(e) => setNewContactMiddleName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Телефон
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        placeholder="+38 (0__) ___-__-__"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(formatPhoneInputMask(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Email
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactEmail}
                        onChange={(e) => setNewContactEmail(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              {convertPreset !== "contact" && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">
                    {reorderMode
                      ? "Замовлення"
                      : convertPreset === "company_contact_deal"
                        ? "Крок 3. Угода"
                        : "Крок 2. Угода"}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={createDeal}
                      onChange={(e) => setCreateDeal(e.target.checked)}
                    />
                    Створити замовлення з цього ліда
                  </label>
                </div>

                {createDeal && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Назва угоди
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={dealTitle}
                        onChange={(e) => setDealTitle(e.target.value)}
                        placeholder={title}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Сума
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={dealAmount ?? ""}
                        onChange={(e) =>
                          setDealAmount(
                            e.target.value === "" ? undefined : Number(e.target.value),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Коментар
                      </label>
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={dealComment}
                        onChange={(e) => setDealComment(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600" htmlFor="lead-owner-convert">
                        Відповідальний
                      </label>
                      <div className="mt-1" id="lead-owner-convert">
                        <SearchableSelectLite
                          value={convertOwnerId ?? ""}
                          options={responsibleOptions}
                          placeholder="Оберіть відповідального…"
                          disabled={converting || loadingUsers}
                          isLoading={loadingUsers}
                          onChange={(id) => setConvertOwnerId(id || null)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {createdOrderId && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Конвертацію завершено. Замовлення створено.{" "}
                  <a
                    href={`/orders?orderId=${createdOrderId}`}
                    className="font-medium underline hover:no-underline"
                  >
                    Відкрити замовлення →
                  </a>
                </div>
              )}

              {convertDoneNoOrder && !createdOrderId && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Лід завершено. Контакт{" "}
                  {lead?.contactId ? (
                    <a
                      href={`/contacts?contactId=${lead.contactId}`}
                      className="font-medium underline hover:no-underline"
                    >
                      відкрити картку контакту →
                    </a>
                  ) : (
                    "збережено."
                  )}
                </div>
              )}

              {convertError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {convertError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConvertWizard(false)}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white"
                  disabled={converting}
                >
                  Закрити
                </button>
                <button
                  type="button"
                  onClick={() => void handleConvert()}
                  disabled={converting}
                  className="btn-primary"
                >
                  {converting ? "Конвертація…" : "Конвертувати"}
                </button>
              </div>
    </div>
  ) : lead && leadTab === "main" ? (
    <FeedTabsScaffold
      activityContent={
        <div className="h-[420px]">
          <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={lead?.contactId || lead.id} entityType={lead?.contactId ? "contact" : "lead"} showActivityButtons={true} />
        </div>
      }
      tasksContent={
        <div className="h-[420px] overflow-auto">
          <EntityTasksList leadId={leadId} />
        </div>
      }
    />
  ) : null;

  const tabsUnderHeader =
    lead ? (
      <div className="space-y-2">
        <LeadStepper
          stage={leadStatusToUiStage(lead.status, leadStatusToUiStepMap)}
          steps={leadStepperSteps}
          disabled={statusUpdating}
          onStepClick={(key) => {
            const terminal = ["WON", "NOT_TARGET", "LOST", "SPAM"].includes(lead.status);
            if (terminal) return;
            if (key === "NEW" && lead.status !== "NEW") void updateStatus("NEW");
            else if (key === "IN_PROGRESS" && lead.status !== "IN_PROGRESS") void updateStatus("IN_PROGRESS");
            else if (key === "PROCESSED" && (lead.status === "NEW" || lead.status === "IN_PROGRESS")) {
              openCompleteOutcomeDialog();
            }
          }}
        />
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
          <button
            type="button"
            onClick={() => setLeadTab("main")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leadTab === "main" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Основне
          </button>
          <button
            type="button"
            onClick={() => setLeadTab("products")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leadTab === "products" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Товари
          </button>
          <button
            type="button"
            onClick={() => setLeadTab("activity")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leadTab === "activity" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Активність
          </button>
          <button
            type="button"
            onClick={() => setLeadTab("change-history")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leadTab === "change-history" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Історія змін
          </button>
          <button
            type="button"
            onClick={() => setLeadTab("source")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leadTab === "source" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Джерело
          </button>
        </div>
      </div>
    ) : null;

  const leadHeaderActions = (
    <>
      {lead ? (
        <div ref={leadHeaderMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setLeadHeaderMenuOpen((o) => !o)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
            aria-expanded={leadHeaderMenuOpen}
            aria-haspopup="menu"
            aria-label="Меню: дії з лідом"
            title="Дії з лідом"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {leadHeaderMenuOpen ? (
            <div
              className="absolute right-0 top-full z-[100] mt-1 w-[min(100vw-2rem,20rem)] rounded-lg border border-zinc-200 bg-white shadow-lg"
              role="menu"
            >
              <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-auto p-3">
                {canCreateOrderFromWon ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLeadHeaderMenuOpen(false);
                      openConvertWizard();
                    }}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Створити замовлення з ліда
                  </button>
                ) : null}
                {effectiveRole === "MANAGER" ||
                effectiveRole === "ADMIN" ||
                effectiveRole === "LEAD" ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={queueingDialer}
                    onClick={async () => {
                      if (!lead) return;
                      setLeadHeaderMenuOpen(false);
                      setQueueingDialer(true);
                      setErr(null);
                      try {
                        await manualCallingApi.enqueue({ leadId: lead.id });
                      } catch (e) {
                        const msg =
                          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                          (e instanceof Error ? e.message : "Не вдалося додати в чергу");
                        setErr(msg);
                      } finally {
                        setQueueingDialer(false);
                      }
                    }}
                    className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {queueingDialer ? "…" : "У чергу прозвону"}
                  </button>
                ) : null}
                {isAdmin ? (
                  <div className="border-t border-zinc-100 pt-3">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={deleting}
                      onClick={async () => {
                        setLeadHeaderMenuOpen(false);
                        if (!lead || !confirm("Видалити лід? Цю дію неможливо скасувати.")) return;
                        setDeleting(true);
                        setErr(null);
                        try {
                          await leadsApi.delete(lead.id);
                          onUpdated();
                          onClose();
                        } catch (e) {
                          const msg =
                            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                            (e instanceof Error ? e.message : "Не вдалося видалити лід");
                          setErr(msg);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {deleting ? "Видалення…" : "Видалити лід"}
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                    Видалення доступне лише для ADMIN
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {showCompleteOutcomeDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-outcome-title"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            scheduleModalClose(() => setShowCompleteOutcomeDialog(false));
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="complete-outcome-title" className="text-base font-semibold text-zinc-900">
              Оберіть результат завершення ліда
            </h2>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => openConvertWizard("company_contact_deal")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Компанія + контакт + замовлення</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={() => openConvertWizard("contact_deal")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Контакт + замовлення</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={() => openConvertWizard("contact")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Лише контакт</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={markAsPoorQuality}
                disabled={statusUpdating}
                className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
              >
                <span>Нецільовий лід</span>
                <span className="text-red-600">→</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCompleteOutcomeDialog(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      <EntityModalShell
        title={title}
        subtitle={lead ? formatDt(lead.createdAt) : undefined}
        tabsUnderHeader={tabsUnderHeader}
        headerActions={leadHeaderActions}
        left={leftContent}
        right={rightContent}
        footer={
          lead ? (
            <div className="text-xs text-zinc-500">
              ID: <span className="font-mono">{lead.id}</span>
            </div>
          ) : null
        }
        canClose={canClose}
        onClose={onClose}
        onEscape={handleEscape}
      />
    </>
  );
}

export default LeadModal;

