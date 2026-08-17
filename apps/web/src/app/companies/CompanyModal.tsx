"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { CONTACT_REGION_OPTIONS } from "../contacts/contact-region-options";
import { AddressSuggestionsDropdown } from "@/components/inputs/AddressSuggestionsDropdown";
import { apiHttp } from "../../lib/api/client";
import type { MeResponse } from "@/lib/api/resources/auth";
import { companiesApi, type Company } from "@/lib/api/resources/companies";
import { EntityChangeHistoryPanel } from "@/components/EntityChangeHistoryPanel";
import { HelpRelated } from "@/components/help/HelpRelated";
import {
  EntityAddressesSection,
  pickVisitReadyAddresses,
} from "@/components/EntityAddressesSection";
import { VisitLocationPicker } from "@/components/visits/VisitLocationPicker";
import {
  buildVisitLocationCreatePayload,
  defaultVisitLocationFromAddresses,
  visitLocationHasCoords,
  type VisitLocationValue,
} from "@/lib/visits/visit-location.types";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { formatDateTime } from "@/lib/crmDatetime";
import { visitsApi } from "@/lib/api";
import { manualCallingApi } from "@/lib/api/resources/manual-calling";
import { KyivstarDialButton } from "@/components/kyivstar/KyivstarDialButton";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { CompanyTimeline } from "./CompanyTimeline";
import { EntityCallRecordingsPanel } from "@/components/calls/EntityCallRecordingsPanel";
import { OrderModal } from "../orders/OrderModal";
import { EntityTasksList } from "@/components/EntityTasksList";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import {
  addressHasHouseNumber,
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  mergeFormattedAddressWithUserDetail,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";
import { strings } from "@/locales";
import { useToast } from "@/components/feedback";

type GoogleMapsPublicConfig = { mapsApiKey: string | null };

function CompanyGoogleScriptLoader({
  mapsApiKey: key,
  onState,
}: {
  mapsApiKey: string;
  onState: (state: { isLoaded: boolean; loadError: Error | undefined }) => void;
}) {
  const { isLoaded, loadError } = useLoadScript({
    id: "google-map-script-company",
    googleMapsApiKey: key,
  });
  useEffect(() => {
    onState({ isLoaded, loadError: loadError ?? undefined });
  }, [isLoaded, loadError, onState]);
  return null;
}

type Props = {
  apiBaseUrl: string;
  companyId: string;
  onClose: () => void;
  onUpdate: () => void;
  onOpenContact?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
  /** Stacking order when opened over another entity modal (default 50). */
  zIndex?: number;
  /** Bumps the orders list when a stacked order is saved outside this modal. */
  externalOrdersReloadKey?: number;
};

export function CompanyModal({
  apiBaseUrl,
  companyId,
  onClose,
  onUpdate,
  onOpenContact,
  onOpenOrder,
  zIndex,
  externalOrdersReloadKey,
}: Props) {
  const isCreate = companyId === "new";

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [edrpou, setEdrpou] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [createOwnerId, setCreateOwnerId] = useState<string | null>(null);

  // Inline edit (existing company) — synced from company
  const [editName, setEditName] = useState("");
  const [editEdrpou, setEditEdrpou] = useState("");
  const [editTaxId, setEditTaxId] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLat, setEditLat] = useState<number | null>(null);
  const [editLng, setEditLng] = useState<number | null>(null);
  const [editGooglePlaceId, setEditGooglePlaceId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // Users (for owner select)
  const [users, setUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Address + Google Maps
  const [addressStatus, setAddressStatus] = useState<"google" | "geocoded" | "manual" | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);
  const [isMapEnabled, setIsMapEnabled] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false);
  const [isGeocodeLoading, setIsGeocodeLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressHint, setAddressHint] = useState<string | null>(null);
  const [addressRequiredForVisit, setAddressRequiredForVisit] = useState(false);
  const [visitLocation, setVisitLocation] = useState<VisitLocationValue | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<Error | undefined>(undefined);
  const addressBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressAnchorRef = useRef<HTMLDivElement>(null);
  const lastGeocodedAddressRef = useRef<string>("");
  const autocompleteAbortRef = useRef<AbortController | null>(null);

  // Orders
  const [orderId, setOrderId] = useState<string | null>(null);
  const usesExternalOrders = Boolean(onOpenOrder);
  const openOrder = onOpenOrder ?? setOrderId;
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);
  const mergedOrdersReloadKey = ordersReloadKey + (externalOrdersReloadKey ?? 0);
  const [planningVisit, setPlanningVisit] = useState(false);
  const [visitPurpose, setVisitPurpose] = useState("");
  const [visitStartsAt, setVisitStartsAt] = useState("");
  const [visitDurationMin, setVisitDurationMin] = useState("60");
  const [visitPlanError, setVisitPlanError] = useState<string | null>(null);
  const [visitPlanSuccess, setVisitPlanSuccess] = useState<string | null>(null);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const [queueingDialer, setQueueingDialer] = useState(false);
  const { pushToast } = useToast();

  // Contacts linked to this company
  const [companyContacts, setCompanyContacts] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [linkContactOpen, setLinkContactOpen] = useState(false);
  const [allContactsForLink, setAllContactsForLink] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);
  const [linkingContactId, setLinkingContactId] = useState<string | null>(null);

  type LeftTabId = "main" | "orders" | "contacts" | "tasks" | "change-history";
  const [leftTab, setLeftTab] = useState<LeftTabId>("main");

  const canClose = !saving && !creatingOrder;

  const title = useMemo(() => (isCreate ? "Нова компанія" : "Компанія"), [isCreate]);

  useEffect(() => {
    if (companyId) {
      setLoadingUsers(true);
      apiHttp
        .get<{ items: { id: string; fullName: string; email: string }[] }>("/users")
        .then((res) => setUsers(Array.isArray(res.data?.items) ? res.data.items : []))
        .finally(() => setLoadingUsers(false));
    }
  }, [companyId]);

  const allContactsOptions = useMemo(
    () =>
      allContactsForLink.map((c) => ({
        id: c.id,
        label: `${c.lastName} ${c.firstName} — ${formatPhoneDisplay(c.phone)}`,
      })),
    [allContactsForLink],
  );

  const visitReadyAddresses = useMemo(
    () => pickVisitReadyAddresses(company?.addresses ?? []),
    [company?.addresses],
  );

  useEffect(() => {
    setVisitLocation((prev) => {
      if (prev && visitLocationHasCoords(prev)) {
        if (prev.mode === "entity" && visitReadyAddresses.some((a) => a.id === prev.addressId)) {
          return prev;
        }
        if (prev.mode === "other") return prev;
      }
      return defaultVisitLocationFromAddresses(visitReadyAddresses);
    });
  }, [visitReadyAddresses]);

  const refresh = useCallback(async () => {
    if (isCreate) {
      setLoading(false);
      setCompany(null);
      setName("");
      setEdrpou("");
      setTaxId("");
      setPhone("");
      setAddress("");
      setLat(null);
      setLng(null);
      setGooglePlaceId(null);
      setAddressStatus(null);
      setAddressError(null);
      setIsMapEnabled(false);
      setCreateOwnerId(null);
      void apiHttp
        .get<MeResponse>("/auth/me")
        .then((res) => {
          const uid = res.data?.user?.id;
          if (uid) setCreateOwnerId(String(uid));
        })
        .catch(() => {});
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<Company>(`/companies/${companyId}`);
      const data = res.data as Company;
      setCompany(data);
      setName(data.name ?? "");
      setEdrpou((data.edrpou ?? "") as string);
      setTaxId((data.taxId ?? "") as string);
      setPhone((data.phone ?? "") as string);
      setAddress((data.address ?? "") as string);
      setEditName(data.name ?? "");
      setEditEdrpou((data.edrpou ?? "") as string);
      setEditTaxId((data.taxId ?? "") as string);
      setEditPhone((data.phone ?? "") as string);
      setEditAddress((data.address ?? "") as string);
      setEditLat(data.lat ?? null);
      setEditLng(data.lng ?? null);
      setEditGooglePlaceId(data.googlePlaceId ?? null);
      setOwnerId(data.ownerId != null ? String(data.ownerId) : null);
    } catch (e) {
      setCompany(null);
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити компанію");
    } finally {
      setLoading(false);
    }
  }, [companyId, isCreate]);

  const loadCompanyContacts = useCallback(async () => {
    if (isCreate) {
      setCompanyContacts([]);
      return;
    }
    setLoadingContacts(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; firstName: string; lastName: string; phone: string }[] }>(
        `/contacts?companyId=${encodeURIComponent(companyId)}&page=1&pageSize=100`,
      );
      setCompanyContacts(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingContacts(false);
    }
  }, [companyId, isCreate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (company && !isCreate) {
      setEditName(company.name ?? "");
      setEditEdrpou((company.edrpou ?? "") as string);
      setEditTaxId((company.taxId ?? "") as string);
      setEditPhone((company.phone ?? "") as string);
      setEditAddress((company.address ?? "") as string);
      setEditLat(company.lat ?? null);
      setEditLng(company.lng ?? null);
      setEditGooglePlaceId(company.googlePlaceId ?? null);
    }
  }, [company, isCreate]);

  useEffect(() => {
    if (editLat != null && editLng != null) setAddressRequiredForVisit(false);
  }, [editLat, editLng]);

  const loadMapsConfig = useCallback(async () => {
    try {
      const res = await apiHttp.get<GoogleMapsPublicConfig>("/settings/google-maps/public");
      const key = res.data?.mapsApiKey ?? null;
      setMapsApiKey(key);
      if (!key) {
        setMapsConfigError(
          "Ключ Google Maps API не налаштовано. Автодоповнення адреси працює лише як простий текст.",
        );
      } else {
        setMapsConfigError(null);
      }
    } catch {
      setMapsApiKey(null);
      setMapsConfigError("Не вдалося завантажити конфігурацію Google Maps.");
    }
  }, []);

  useEffect(() => {
    void loadMapsConfig();
  }, [loadMapsConfig]);

  useEffect(() => {
    if (!mapsApiKey) {
      setIsGoogleLoaded(false);
      setGoogleLoadError(undefined);
    }
  }, [mapsApiKey]);

  useEffect(() => {
    if (companyId && !isCreate) void loadCompanyContacts();
  }, [companyId, isCreate, loadCompanyContacts]);

  const handleEscape = useCallback(() => {
    if (!usesExternalOrders && orderId) {
      setOrderId(null);
      return true;
    }
    return false;
  }, [orderId, usesExternalOrders]);

  const patchCompany = useCallback(
    async (payload: {
      name?: string;
      edrpou?: string;
      taxId?: string;
      phone?: string;
      address?: string;
      lat?: number | null;
      lng?: number | null;
      googlePlaceId?: string | null;
      ownerId?: string | null;
    }) => {
      if (isCreate || !companyId) return;
      setSaving(true);
      setErr(null);
      try {
        await apiHttp.patch(`/companies/${companyId}`, payload);
        await refresh();
        if (payload.ownerId !== undefined) setOwnerId(payload.ownerId != null ? String(payload.ownerId) : null);
        onUpdate();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Не вдалося зберегти");
      } finally {
        setSaving(false);
      }
    },
    [companyId, isCreate, refresh, onUpdate],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: String(u.id), label: u.fullName || u.email })),
    [users],
  );

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        region: region.trim(),
        ...(edrpou.trim() ? { edrpou: edrpou.trim() } : {}),
        ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
        ownerId: createOwnerId,
      };
      if (!payload.name) throw new Error("Назва обов'язкова");
      if (!payload.phone) throw new Error("Телефон обов'язковий");
      if (!payload.region) throw new Error("Область обов'язкова");

      await apiHttp.post<Company>("/companies", payload);
      onUpdate();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  const openLinkContact = async () => {
    setLinkContactOpen(true);
    setLoadingAllContacts(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; firstName: string; lastName: string; phone: string }[] }>(
        "/contacts?page=1&pageSize=200",
      );
      setAllContactsForLink(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingAllContacts(false);
    }
  };

  const linkContactToCompany = async (contactId: string) => {
    setLinkingContactId(contactId);
    try {
      await apiHttp.patch(`/contacts/${contactId}`, { companyId });
      await loadCompanyContacts();
      setLinkContactOpen(false);
    } finally {
      setLinkingContactId(null);
    }
  };

  const scheduleVisit = async () => {
    if (!company || isCreate) return;
    if (!visitLocation || !visitLocationHasCoords(visitLocation)) {
      setAddressRequiredForVisit(true);
      setVisitPlanError(strings.visitLocation.coordsRequired);
      setVisitPlanSuccess(null);
      return;
    }
    if (!visitPurpose.trim()) {
      setVisitPlanError("Укажите цель встречи.");
      setVisitPlanSuccess(null);
      return;
    }
    const durationMin = Math.max(15, Number.parseInt(visitDurationMin, 10) || 60);
    try {
      setPlanningVisit(true);
      setVisitPlanError(null);
      setVisitPlanSuccess(null);
      setAddressRequiredForVisit(false);
      const visit = await visitsApi.create({
        companyId: company.id,
        title: company.name || "Візит",
        purpose: visitPurpose.trim(),
        ...buildVisitLocationCreatePayload(visitLocation, "company"),
      });
      if (visitStartsAt) {
        const startsAt = new Date(visitStartsAt);
        const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);
        await visitsApi.update(visit.id, {
          status: "SCHEDULED",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMin,
          purpose: visitPurpose.trim(),
        });
        setVisitPlanSuccess("Зустріч заплановано та додано в активність компанії.");
      } else {
        setVisitPlanSuccess("Зустріч додано в backlog. Вкажіть час пізніше на сторінці візитів.");
      }
      setVisitPurpose("");
      setVisitStartsAt("");
      setVisitDurationMin("60");
      setTimelineRefreshKey((prev) => prev + 1);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося запланувати візит");
      setVisitPlanError(msg);
      setVisitPlanSuccess(null);
    } finally {
      setPlanningVisit(false);
    }
  };

  const enqueueDialer = useCallback(async () => {
    if (!company || isCreate) return;
    const phoneValue = (editPhone.trim() || company.phone || "").trim();
    if (!phoneValue) {
      pushToast("Укажите телефон компании.", "error");
      return;
    }
    setQueueingDialer(true);
    try {
      await manualCallingApi.enqueue({ companyId: company.id });
      pushToast("Добавлено в очередь прозвона.", "success");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не удалось добавить в очередь");
      pushToast(msg, "error");
    } finally {
      setQueueingDialer(false);
    }
  }, [company, isCreate, editPhone, pushToast]);

  const handleSelectAddressSuggestion = useCallback(
    async (suggestion: PlaceSuggestion, forCreate: boolean) => {
      if (!mapsApiKey) return;
      const userTypedBeforeSelect = (forCreate ? address : editAddress).trim();
      if (forCreate) {
        setAddress(suggestion.description);
      } else {
        setEditAddress(suggestion.description);
      }
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressError(null);
      setAddressHint(null);
      setIsGeocodeLoading(true);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setAddressError("Сервіс адрес тимчасово недоступний.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(
          userTypedBeforeSelect,
          result.formattedAddress || suggestion.description,
        );
        if (!addressHasHouseNumber(merged)) {
          if (forCreate) {
            setAddress(merged);
            setLat(null);
            setLng(null);
            setGooglePlaceId(null);
          } else {
            setEditAddress(merged);
            setEditLat(null);
            setEditLng(null);
            setEditGooglePlaceId(null);
            void patchCompany({
              address: merged,
              lat: null,
              lng: null,
              googlePlaceId: null,
            });
          }
          setAddressStatus(null);
          setAddressHint(strings.common.houseNumberHint);
          setAddressError(null);
          return;
        }
        setAddressHint(null);
        if (forCreate) {
          setLat(result.lat);
          setLng(result.lng);
          setGooglePlaceId(result.placeId);
          setAddress(merged);
        } else {
          setEditLat(result.lat);
          setEditLng(result.lng);
          setEditGooglePlaceId(result.placeId);
          setEditAddress(merged);
          void patchCompany({
            address: merged,
            lat: result.lat,
            lng: result.lng,
            googlePlaceId: result.placeId,
          });
        }
        setAddressStatus("google");
      } catch {
        setAddressError("Сервіс адрес тимчасово недоступний.");
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [address, editAddress, mapsApiKey, patchCompany],
  );

  const geocodeFromAddressText = useCallback(
    async (rawAddress: string, forCreate: boolean) => {
      const query = rawAddress.trim();
      if (!mapsApiKey || query.length < 3) return;
      if (lastGeocodedAddressRef.current === query) return;
      if (!addressHasHouseNumber(query)) {
        lastGeocodedAddressRef.current = "";
        setAddressHint(strings.common.houseNumberHint);
        setAddressError(null);
        setAddressStatus(null);
        if (forCreate) {
          setLat(null);
          setLng(null);
          setGooglePlaceId(null);
        } else {
          setEditLat(null);
          setEditLng(null);
          setEditGooglePlaceId(null);
          void patchCompany({
            address: query,
            lat: null,
            lng: null,
            googlePlaceId: null,
          });
        }
        return;
      }
      lastGeocodedAddressRef.current = query;
      setAddressError(null);
      setAddressHint(null);
      setIsGeocodeLoading(true);
      try {
        const result = await geocodeText(mapsApiKey, query, { regionCode: "UA" });
        if (!result) {
          setAddressError("Сервіс адрес тимчасово недоступний.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(query, result.formattedAddress || query);
        if (!addressHasHouseNumber(merged)) {
          lastGeocodedAddressRef.current = "";
          setAddressHint(strings.common.houseNumberHint);
          setAddressError(null);
          setAddressStatus(null);
          if (forCreate) {
            setAddress(merged);
            setLat(null);
            setLng(null);
            setGooglePlaceId(null);
          } else {
            setEditAddress(merged);
            setEditLat(null);
            setEditLng(null);
            setEditGooglePlaceId(null);
            void patchCompany({
              address: merged,
              lat: null,
              lng: null,
              googlePlaceId: null,
            });
          }
          return;
        }
        setAddressHint(null);
        lastGeocodedAddressRef.current = merged.trim();
        if (forCreate) {
          setLat(result.lat);
          setLng(result.lng);
          setGooglePlaceId(result.placeId);
          setAddress(merged);
        } else {
          setEditLat(result.lat);
          setEditLng(result.lng);
          setEditGooglePlaceId(result.placeId);
          setEditAddress(merged);
          void patchCompany({
            address: merged,
            lat: result.lat,
            lng: result.lng,
            googlePlaceId: result.placeId,
          });
        }
        setAddressStatus("geocoded");
      } catch {
        setAddressError("Сервіс адрес тимчасово недоступний.");
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [mapsApiKey, patchCompany],
  );

  const handleMarkerDragEnd = useCallback(
    async (e: google.maps.MapMouseEvent, forCreate: boolean) => {
      const nextLat = e.latLng?.lat();
      const nextLng = e.latLng?.lng();
      if (nextLat == null || nextLng == null) return;
      setAddressStatus("manual");
      if (forCreate) {
        setLat(nextLat);
        setLng(nextLng);
      } else {
        setEditLat(nextLat);
        setEditLng(nextLng);
        void patchCompany({
          lat: nextLat,
          lng: nextLng,
          googlePlaceId: editGooglePlaceId ?? undefined,
          address: editAddress.trim() || undefined,
        });
      }
    },
    [editAddress, editGooglePlaceId, patchCompany],
  );

  useEffect(() => {
    if (!showAddressSuggestions || !mapsApiKey) {
      setAddressSuggestions([]);
      return;
    }
    const query = (isCreate ? address : editAddress).trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setIsAddressLookupLoading(true);
    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions(suggestions);
        setAddressError(null);
      } catch {
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions([]);
        setAddressError("Сервіс адрес тимчасово недоступний.");
      } finally {
        if (autocompleteAbortRef.current === controller) {
          setIsAddressLookupLoading(false);
        }
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      autocompleteAbortRef.current = null;
    };
  }, [isCreate, address, editAddress, showAddressSuggestions, mapsApiKey]);

  const unlinkContactFromCompany = async (contactId: string) => {
    if (!confirm("Видалити цей контакт з компанії?")) return;
    try {
      await apiHttp.patch(`/contacts/${contactId}`, { companyId: null });
      await loadCompanyContacts();
    } catch {
      // ignore
    }
  };

  // ✅ Create order from company modal
  const createOrder = async () => {
    setCreatingOrder(true);
    setErr(null);
    try {
      const res = await apiHttp.post("/orders", {
        companyId,
        clientId: null,
        comment: "",
        discountAmount: 0,
      });

      const created = res.data as { id: string };
      setOrdersReloadKey((x) => x + 1);
      openOrder(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося створити замовлення");
    } finally {
      setCreatingOrder(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none";
  const labelClass = "text-xs font-medium text-zinc-500";

  const aboutCompanySection = useMemo(() => {
    if (loading) return <div className="text-sm text-zinc-500">Завантаження…</div>;
    if (err)
      return (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      );
    if (!company && !isCreate) return <div className="text-sm text-zinc-500">Не знайдено</div>;
    if (isCreate) {
      return (
        <div className="space-y-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Про компанію</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Назва</label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Введіть назву компанії..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>ЄДРПОУ</label>
                <input
                  className={inputClass}
                  value={edrpou}
                  onChange={(e) => setEdrpou(e.target.value)}
                  placeholder="Введіть ЄДРПОУ..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>ІПН</label>
                <input
                  className={inputClass}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="Введіть ІПН..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Телефон</label>
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Введіть телефон..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Область</label>
                <select
                  className={inputClass}
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={saving}
                >
                  <option value="">—</option>
                  {CONTACT_REGION_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Відповідальний</label>
                <SearchableSelectLite
                  value={createOwnerId ?? ""}
                  options={userOptions}
                  placeholder="—"
                  disabled={saving || loadingUsers}
                  isLoading={loadingUsers}
                  onChange={(id) => setCreateOwnerId(id || null)}
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <p className="text-xs text-zinc-500">Адреси можна додати після створення компанії.</p>
              </div>
            </div>
          </section>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Скасувати
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Про компанію</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Назва</label>
              <input
                className={inputClass}
                placeholder="Введіть назву..."
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  const v = editName.trim();
                  if (v !== (company!.name ?? "")) void patchCompany({ name: v || undefined });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>ЄДРПОУ</label>
              <input
                className={inputClass}
                placeholder="Введіть ЄДРПОУ..."
                value={editEdrpou}
                onChange={(e) => setEditEdrpou(e.target.value)}
                onBlur={() => {
                  const v = editEdrpou.trim() || null;
                  if (v !== (company!.edrpou ?? null)) void patchCompany({ edrpou: v ?? undefined });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>ІПН</label>
              <input
                className={inputClass}
                placeholder="Введіть ІПН..."
                value={editTaxId}
                onChange={(e) => setEditTaxId(e.target.value)}
                onBlur={() => {
                  const v = editTaxId.trim() || null;
                  if (v !== (company!.taxId ?? null)) void patchCompany({ taxId: v ?? undefined });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Телефон</label>
              <input
                className={inputClass}
                placeholder="Введіть телефон..."
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                onBlur={() => {
                  const v = editPhone.trim() || null;
                  if (v !== (company!.phone ?? null)) void patchCompany({ phone: v ?? undefined });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={saving}
              />
              {(editPhone.trim() || company!.phone) ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <KyivstarDialButton
                    phone={(editPhone.trim() || company!.phone)!}
                    size="md"
                    label="Click2Dial Kyivstar"
                  />
                  <a
                    href={`tel:${editPhone.trim() || company!.phone}`}
                    className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
                  >
                    або звичайний tel:
                  </a>
                  <button
                    type="button"
                    disabled={queueingDialer || saving}
                    onClick={() => void enqueueDialer()}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {queueingDialer ? "Добавляем…" : "В очередь прозвона"}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Відповідальний</label>
              <SearchableSelectLite
                variant="inline"
                value={ownerId ?? ""}
                options={userOptions}
                placeholder="—"
                disabled={saving || loadingUsers}
                isLoading={loadingUsers}
                onChange={async (id) => {
                  const next = id || null;
                  setOwnerId(next);
                  await patchCompany({ ownerId: next });
                }}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              {!isCreate && company ? (
                <EntityAddressesSection
                  entityType="company"
                  entityId={company.id}
                  disabled={saving}
                  highlightMissingCoords={addressRequiredForVisit}
                  onUpdated={() => void refresh()}
                />
              ) : (
                <p className="text-xs text-zinc-500">Адреси можна додати після створення компанії.</p>
              )}
            </div>
          </div>
        </section>
        <div className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-3 text-sm">
          <span className={labelClass}>Останній візит</span>
          <div className="flex items-center gap-3">
            <span className="text-zinc-900">
              {company!.lastVisitAt
                ? formatDateTime(company!.lastVisitAt)
                : <span className="font-normal text-zinc-400">Немає візитів</span>}
            </span>
            <button
              type="button"
              onClick={() => void scheduleVisit()}
              disabled={saving || planningVisit}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Запланувати зустріч
            </button>
          </div>
        </div>
        <div id="company-visit-plan" className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Планування зустрічі</div>
              <p className="mt-1 text-xs text-zinc-500">
                Плануйте зустріч прямо по компанії: мета обовʼязкова, час можна задати одразу.
              </p>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              {visitReadyAddresses.length > 0 ? "Координати готові" : "Потрібно додати адресу"}
            </div>
          </div>
          <div className="mt-4">
            <VisitLocationPicker
              entityType="company"
              addresses={company?.addresses ?? []}
              value={visitLocation}
              onChange={(next) => {
                setVisitLocation(next);
                setAddressRequiredForVisit(false);
              }}
              mapsApiKey={mapsApiKey}
              error={addressRequiredForVisit}
              disabled={saving || planningVisit}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Цель встречи</span>
              <textarea
                value={visitPurpose}
                onChange={(e) => setVisitPurpose(e.target.value)}
                rows={3}
                disabled={saving || planningVisit}
                placeholder="Наприклад: презентація, переговори, узгодження оплати"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Дата и время</span>
                <input
                  type="datetime-local"
                  value={visitStartsAt}
                  onChange={(e) => setVisitStartsAt(e.target.value)}
                  disabled={saving || planningVisit}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Тривалість, хв</span>
                <select
                  value={visitDurationMin}
                  onChange={(e) => setVisitDurationMin(e.target.value)}
                  disabled={saving || planningVisit}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="30">30</option>
                  <option value="45">45</option>
                  <option value="60">60</option>
                  <option value="90">90</option>
                  <option value="120">120</option>
                </select>
              </label>
            </div>
          </div>
          {visitPlanError ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {visitPlanError}
            </div>
          ) : null}
          {visitPlanSuccess ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {visitPlanSuccess}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void scheduleVisit()}
              disabled={saving || planningVisit}
              className="btn-primary"
            >
              {planningVisit
                ? "Зберігаємо…"
                : visitStartsAt
                  ? "Запланувати на дату"
                  : "Добавить в backlog"}
            </button>
            <p className="text-xs text-zinc-500">
              Якщо дату не вказувати, зустріч створиться без часу і зʼявиться в backlog візитів.
            </p>
          </div>
        </div>
        <div className="border-t border-zinc-100 pt-3">
          <div className="text-sm font-medium text-zinc-700 mb-2">Контакти</div>
          {loadingContacts ? (
            <p className="text-xs text-zinc-500">Завантаження…</p>
          ) : companyContacts.length === 0 ? (
            <p className="text-xs text-zinc-500">Немає привʼязаних контактів</p>
          ) : (
            <ul className="space-y-2">
              {companyContacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenContact?.(c.id)}
                    disabled={!onOpenContact}
                    className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-left text-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-default disabled:opacity-70 disabled:hover:bg-white disabled:hover:border-zinc-200"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
                        {c.lastName} {c.firstName}
                      </span>
                      {onOpenContact ? (
                        <span className="shrink-0 text-zinc-400" aria-hidden>→</span>
                      ) : null}
                    </div>
                    {c.phone ? (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{formatPhoneDisplay(c.phone)}</div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pt-2 text-xs text-zinc-500">
          Created: {formatDateTime(company!.createdAt)}
          <br />
          Updated: {formatDateTime(company!.updatedAt)}
        </div>
      </div>
    );
  }, [
    loading,
    err,
    company,
    isCreate,
    saving,
    name,
    edrpou,
    taxId,
    phone,
    address,
    lat,
    lng,
    googlePlaceId,
    editName,
    editEdrpou,
    editTaxId,
    editPhone,
    editAddress,
    editLat,
    editLng,
    editGooglePlaceId,
    queueingDialer,
    enqueueDialer,
    onClose,
    save,
    patchCompany,
    loadingContacts,
    companyContacts,
    onOpenContact,
    scheduleVisit,
    addressRequiredForVisit,
    mapsApiKey,
    mapsConfigError,
    showAddressSuggestions,
    addressSuggestions,
    isAddressLookupLoading,
    isGeocodeLoading,
    addressError,
    addressStatus,
    isMapEnabled,
    isGoogleLoaded,
    handleSelectAddressSuggestion,
    geocodeFromAddressText,
    handleMarkerDragEnd,
  ]);

  const tabsUnderHeader = (
    <div className="flex gap-1 py-2">
      {(["main", "orders", "contacts", "tasks", "change-history"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setLeftTab(tab)}
          className={`rounded px-2 py-1.5 text-sm font-medium ${
            leftTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {tab === "main"
            ? "Основне"
            : tab === "orders"
              ? "Замовлення"
              : tab === "contacts"
                ? "Контакти"
                : tab === "tasks"
                  ? "Завдання"
                  : "Історія змін"}
        </button>
      ))}
    </div>
  );

  const leftContent = (
    <div className="min-h-0">
      {leftTab === "main" && (
        isCreate ? (
          <div className="min-h-0 overflow-auto">
            <EntitySection title="Про компанію">{aboutCompanySection}</EntitySection>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
            <div className="min-h-0 overflow-auto border-zinc-200 lg:border-r lg:pr-4">
              <EntitySection title="Про компанію">{aboutCompanySection}</EntitySection>
            </div>
            <div className="min-h-0 overflow-auto pt-4 lg:pt-0 lg:pl-4 space-y-3">
              <HelpRelated entityType="COMPANY" compact />
              <EntityCallRecordingsPanel companyId={companyId} />
              <EntitySection title="Активність">
                <CompanyTimeline key={timelineRefreshKey} apiBaseUrl={apiBaseUrl} companyId={companyId} />
              </EntitySection>
            </div>
          </div>
        )
      )}

      {leftTab === "orders" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Спочатку збережіть компанію, щоб переглянути замовлення.</p>
          ) : (
            <EntitySection title="Замовлення">
              <div className="min-h-0 overflow-auto">
                <EntityOrdersList
                  key={mergedOrdersReloadKey}
                  apiBaseUrl={apiBaseUrl}
                  query={`companyId=${companyId}&pageSize=50`}
                  onOpenOrder={openOrder}
                />
              </div>
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "contacts" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Спочатку збережіть компанію, щоб прив’язати контакти.</p>
          ) : (
            <EntitySection
              title="Контакти"
              rightAction={
                <button
                  type="button"
                  onClick={() =>
                    linkContactOpen ? setLinkContactOpen(false) : openLinkContact()
                  }
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {linkContactOpen ? "Скасувати" : "Привʼязати контакт"}
                </button>
              }
            >
              {linkContactOpen ? (
                <div className="mt-2">
                  {loadingAllContacts ? (
                    <div className="text-xs text-zinc-500">Завантаження…</div>
                  ) : allContactsOptions.length === 0 ? (
                    <div className="text-xs text-zinc-500">Немає контактів</div>
                  ) : (
                    <SearchableSelectLite
                      value={null}
                      options={allContactsOptions}
                      placeholder="Оберіть контакт для привʼязки…"
                      disabled={!!linkingContactId}
                      onChange={(id) => id != null && void linkContactToCompany(id)}
                    />
                  )}
                </div>
              ) : (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-zinc-200 bg-white">
                  {loadingContacts ? (
                    <div className="p-2 text-xs text-zinc-500">Завантаження…</div>
                  ) : companyContacts.length === 0 ? (
                    <div className="p-2 text-xs text-zinc-500">Немає привʼязаних контактів</div>
                  ) : (
                    <ul className="divide-y divide-zinc-100 text-sm">
                      {companyContacts.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            {c.lastName} {c.firstName}
                            {c.phone ? ` — ${formatPhoneDisplay(c.phone)}` : ""}
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {onOpenContact ? (
                              <button
                                type="button"
                                onClick={() => onOpenContact(c.id)}
                                className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
                              >
                                Open contact
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void unlinkContactFromCompany(c.id)}
                              className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                              title="Видалити з компанії"
                              aria-label="Remove from company"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "tasks" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Спочатку збережіть компанію, щоб керувати завданнями.</p>
          ) : (
            <EntitySection title="Завдання">
              <EntityTasksList companyId={companyId} />
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "change-history" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Спочатку збережіть компанію, щоб переглянути історію змін.</p>
          ) : (
            <EntitySection title="Історія змін">
              <EntityChangeHistoryPanel entityType="Company" entityId={companyId!} />
            </EntitySection>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {mapsApiKey ? (
        <CompanyGoogleScriptLoader
          mapsApiKey={mapsApiKey}
          onState={({ isLoaded, loadError }) => {
            setIsGoogleLoaded(isLoaded);
            setGoogleLoadError(loadError ?? undefined);
          }}
        />
      ) : null}
      <EntityModalShell
        title={title}
        subtitle={company?.name}
        headerActions={
          !isCreate ? (
            <div className="flex items-center gap-2">
              {(editPhone.trim() || company?.phone) ? (
                <KyivstarDialButton
                  phone={(editPhone.trim() || company?.phone)!}
                  size="md"
                  label="Позвонить"
                />
              ) : null}
              <button
                type="button"
                disabled={loading || !!err || planningVisit}
                onClick={() => {
                  setLeftTab("main");
                  window.setTimeout(() => {
                    document.getElementById("company-visit-plan")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 50);
                }}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                + Visit
              </button>
              <button
                type="button"
                disabled={loading || !!err || creatingOrder}
                onClick={() => void createOrder()}
                className="btn-primary py-1.5"
              >
                {creatingOrder ? "Creating…" : "+ Order"}
              </button>
            </div>
          ) : null
        }
        tabsUnderHeader={tabsUnderHeader}
        left={leftContent}
        right={null}
        footer={null}
        canClose={canClose}
        onClose={onClose}
        onEscape={handleEscape}
        zIndex={zIndex}
      />

      {!usesExternalOrders && orderId ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          zIndex={(zIndex ?? 50) + 10}
          onClose={() => setOrderId(null)}
          onSaved={() => {
            setOrdersReloadKey((x) => x + 1);
          }}
          onOpenOrder={openOrder}
          onOpenContact={onOpenContact}
        />
      ) : null}
    </>
  );
}
