"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { apiHttp } from "../../lib/api/client";
import { companiesApi, type CompanyChangeHistoryItem } from "@/lib/api/resources/companies";
import { visitsApi } from "@/lib/api";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { CompanyTimeline } from "./CompanyTimeline";
import { OrderModal } from "../orders/OrderModal";
import { EntityTasksList } from "@/components/EntityTasksList";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import {
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";

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

type Company = {
  id: string;
  name: string;
  edrpou?: string | null;
  taxId?: string | null;
  phone?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  ownerId?: string | null;
  owner?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  lastVisitAt?: string | null;
};

type Props = {
  apiBaseUrl: string;
  companyId: string;
  onClose: () => void;
  onUpdate: () => void;
  onOpenContact?: (id: string) => void;
};

export function CompanyModal({ apiBaseUrl, companyId, onClose, onUpdate, onOpenContact }: Props) {
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
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<Error | undefined>(undefined);
  const addressBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedAddressRef = useRef<string>("");
  const autocompleteAbortRef = useRef<AbortController | null>(null);

  // Orders
  const [orderId, setOrderId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  // Contacts linked to this company
  const [companyContacts, setCompanyContacts] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [linkContactOpen, setLinkContactOpen] = useState(false);
  const [allContactsForLink, setAllContactsForLink] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);
  const [linkingContactId, setLinkingContactId] = useState<string | null>(null);

  type LeftTabId = "main" | "orders" | "contacts" | "tasks" | "change-history";
  const [leftTab, setLeftTab] = useState<LeftTabId>("main");

  // Change history
  const [changeHistory, setChangeHistory] = useState<CompanyChangeHistoryItem[]>([]);
  const [loadingChangeHistory, setLoadingChangeHistory] = useState(false);
  const [changeHistoryError, setChangeHistoryError] = useState<string | null>(null);

  const canClose = !saving && !creatingOrder;

  const title = useMemo(() => (isCreate ? "New company" : "Company"), [isCreate]);

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
        label: `${c.firstName} ${c.lastName} — ${c.phone}`,
      })),
    [allContactsForLink],
  );

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
      setOwnerId(data.ownerId ?? null);
    } catch (e) {
      setCompany(null);
      setErr(e instanceof Error ? e.message : "Failed to load company");
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

  const loadMapsConfig = useCallback(async () => {
    try {
      const res = await apiHttp.get<GoogleMapsPublicConfig>("/settings/google-maps/public");
      const key = res.data?.mapsApiKey ?? null;
      setMapsApiKey(key);
      if (!key) {
        setMapsConfigError(
          "Google Maps API key is not configured. Address autocomplete works only as plain text.",
        );
      } else {
        setMapsConfigError(null);
      }
    } catch {
      setMapsApiKey(null);
      setMapsConfigError("Failed to load Google Maps configuration.");
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

  const loadChangeHistory = useCallback(async () => {
    if (isCreate || !companyId) return;
    setLoadingChangeHistory(true);
    setChangeHistoryError(null);
    try {
      const items = await companiesApi.getChangeHistory(companyId);
      setChangeHistory(items);
    } catch (e) {
      setChangeHistoryError(e instanceof Error ? e.message : "Failed to load history");
      setChangeHistory([]);
    } finally {
      setLoadingChangeHistory(false);
    }
  }, [companyId, isCreate]);

  useEffect(() => {
    if (leftTab === "change-history" && !isCreate && companyId) void loadChangeHistory();
  }, [leftTab, isCreate, companyId, loadChangeHistory]);

  const handleEscape = useCallback(() => {
    if (orderId) {
      setOrderId(null);
      return true;
    }
    return false;
  }, [orderId]);

  const patchCompany = useCallback(
    async (payload: {
      name?: string;
      edrpou?: string;
      taxId?: string;
      phone?: string;
      address?: string;
      lat?: number;
      lng?: number;
      googlePlaceId?: string;
      ownerId?: string | null;
    }) => {
      if (isCreate || !companyId) return;
      setSaving(true);
      setErr(null);
      try {
        await apiHttp.patch(`/companies/${companyId}`, payload);
        await refresh();
        if (leftTab === "change-history") void loadChangeHistory();
        if (payload.ownerId !== undefined) setOwnerId(payload.ownerId ?? null);
        onUpdate();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [companyId, isCreate, leftTab, refresh, onUpdate],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, label: u.fullName || u.email })),
    [users],
  );

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        edrpou: edrpou.trim() || null,
        taxId: taxId.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        lat,
        lng,
        googlePlaceId,
        ownerId: createOwnerId ?? null,
      };
      if (!payload.name) throw new Error("Name is required");

      await apiHttp.post<Company>("/companies", payload);
      onUpdate();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
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
    try {
      await visitsApi.create({
        companyId: company.id,
        title: company.name || "Visit",
        addressText: company.address ?? undefined,
        lat: company.lat ?? undefined,
        lng: company.lng ?? undefined,
      });
      alert("Visit added to planned backlog.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to schedule visit");
    }
  };

  const handleSelectAddressSuggestion = useCallback(
    async (suggestion: PlaceSuggestion, forCreate: boolean) => {
      if (!mapsApiKey) return;
      if (forCreate) {
        setAddress(suggestion.description);
      } else {
        setEditAddress(suggestion.description);
      }
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressError(null);
      setIsGeocodeLoading(true);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setAddressError("Address service temporarily unavailable.");
          return;
        }
        if (forCreate) {
          setLat(result.lat);
          setLng(result.lng);
          setGooglePlaceId(result.placeId);
          setAddress(result.formattedAddress || suggestion.description);
        } else {
          setEditLat(result.lat);
          setEditLng(result.lng);
          setEditGooglePlaceId(result.placeId);
          setEditAddress(result.formattedAddress || suggestion.description);
          void patchCompany({
            address: result.formattedAddress || suggestion.description,
            lat: result.lat,
            lng: result.lng,
            googlePlaceId: result.placeId,
          });
        }
        setAddressStatus("google");
      } catch {
        setAddressError("Address service temporarily unavailable.");
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [mapsApiKey, patchCompany],
  );

  const geocodeFromAddressText = useCallback(
    async (rawAddress: string, forCreate: boolean) => {
      const query = rawAddress.trim();
      if (!mapsApiKey || query.length < 3) return;
      if (lastGeocodedAddressRef.current === query) return;
      lastGeocodedAddressRef.current = query;
      setAddressError(null);
      setIsGeocodeLoading(true);
      try {
        const result = await geocodeText(mapsApiKey, query);
        if (!result) {
          setAddressError("Address service temporarily unavailable.");
          return;
        }
        if (forCreate) {
          setLat(result.lat);
          setLng(result.lng);
          setGooglePlaceId(result.placeId);
          setAddress(result.formattedAddress || query);
        } else {
          setEditLat(result.lat);
          setEditLng(result.lng);
          setEditGooglePlaceId(result.placeId);
          setEditAddress(result.formattedAddress || query);
          void patchCompany({
            address: result.formattedAddress || query,
            lat: result.lat,
            lng: result.lng,
            googlePlaceId: result.placeId,
          });
        }
        setAddressStatus("geocoded");
      } catch {
        setAddressError("Address service temporarily unavailable.");
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
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6 });
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions(suggestions);
        setAddressError(null);
      } catch {
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions([]);
        setAddressError("Address service temporarily unavailable.");
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
    if (!confirm("Remove this contact from the company?")) return;
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
      setOrderId(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setCreatingOrder(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none";
  const labelClass = "text-xs font-medium text-zinc-500";

  const aboutCompanySection = useMemo(() => {
    if (loading) return <div className="text-sm text-zinc-500">Loading…</div>;
    if (err)
      return (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      );
    if (!company && !isCreate) return <div className="text-sm text-zinc-500">Not found</div>;
    if (isCreate) {
      return (
        <div className="space-y-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">О компании</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Название</label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Введите название компании..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>ЄДРПОУ</label>
                <input
                  className={inputClass}
                  value={edrpou}
                  onChange={(e) => setEdrpou(e.target.value)}
                  placeholder="Введите ЄДРПОУ..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>ІПН</label>
                <input
                  className={inputClass}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="Введите ІПН..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Телефон</label>
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Введите телефон..."
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Ответственный</label>
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
                <label className={labelClass}>Адрес</label>
                <div className="relative">
                  <input
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      lastGeocodedAddressRef.current = "";
                      setAddressStatus(null);
                      setAddressError(null);
                    }}
                    onFocus={() => setShowAddressSuggestions(true)}
                    onBlur={() => {
                      addressBlurTimeoutRef.current = setTimeout(() => setShowAddressSuggestions(false), 120);
                      if (address.trim().length >= 3 && mapsApiKey) void geocodeFromAddressText(address, true);
                    }}
                    placeholder="Вулиця, місто, індекс"
                    disabled={saving}
                  />
                  {showAddressSuggestions && addressSuggestions.length > 0 ? (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                      {addressSuggestions.map((s) => (
                        <button
                          key={s.placeId}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void handleSelectAddressSuggestion(s, true);
                          }}
                        >
                          {s.description}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-zinc-500">
                  {isAddressLookupLoading && mapsApiKey ? "Поиск адресов…" : null}
                  {!isAddressLookupLoading && isGeocodeLoading ? "Поиск координат…" : null}
                  {!isAddressLookupLoading && !isGeocodeLoading && addressStatus === "google" ? "Адрес из Google" : null}
                  {!isAddressLookupLoading && !isGeocodeLoading && addressStatus === "geocoded" ? "Координаты обновлены" : null}
                  {!isAddressLookupLoading && !isGeocodeLoading && addressStatus === "manual" ? "Точка задана вручную" : null}
                  {!isAddressLookupLoading && !isGeocodeLoading && addressError ? addressError : null}
                  {!mapsApiKey ? mapsConfigError : null}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {lat != null && lng != null ? "Координаты заданы" : "Координаты не заданы"}
                  </span>
                  {mapsApiKey ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-600 hover:underline"
                      onClick={() => setIsMapEnabled(!isMapEnabled)}
                    >
                      {isMapEnabled ? "Скрыть карту" : "Показать карту"}
                    </button>
                  ) : null}
                </div>
                {lat != null && lng != null && mapsApiKey && isMapEnabled && isGoogleLoaded ? (
                  <div className="mt-2 h-44 overflow-hidden rounded-md border border-zinc-200">
                    <GoogleMap
                      mapContainerStyle={{ width: "100%", height: "100%" }}
                      center={{ lat, lng }}
                      zoom={15}
                    >
                      <Marker
                        position={{ lat, lng }}
                        draggable
                        onDragEnd={(e) => void handleMarkerDragEnd(e, true)}
                      />
                    </GoogleMap>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Отмена
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">О компании</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Название</label>
              <input
                className={inputClass}
                placeholder="Введите название..."
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
                placeholder="Введите ЄДРПОУ..."
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
                placeholder="Введите ІПН..."
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
                placeholder="Введите телефон..."
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
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Ответственный</label>
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
              <label className={labelClass}>Адрес</label>
              <div className="relative">
                <input
                  className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Вулиця, місто, індекс"
                  value={editAddress}
                  onChange={(e) => {
                    setEditAddress(e.target.value);
                    lastGeocodedAddressRef.current = "";
                    setAddressStatus(null);
                    setAddressError(null);
                  }}
                  onFocus={() => setShowAddressSuggestions(true)}
                  onBlur={() => {
                    addressBlurTimeoutRef.current = setTimeout(() => setShowAddressSuggestions(false), 120);
                    const v = editAddress.trim() || null;
                    if (v !== (company!.address ?? null)) void patchCompany({ address: v ?? undefined });
                    if (editAddress.trim().length >= 3 && mapsApiKey) void geocodeFromAddressText(editAddress, false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  disabled={saving}
                />
                {showAddressSuggestions && addressSuggestions.length > 0 ? (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                    {addressSuggestions.map((s) => (
                      <button
                        key={s.placeId}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void handleSelectAddressSuggestion(s, false);
                        }}
                      >
                        {s.description}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-zinc-500">
                {isAddressLookupLoading && mapsApiKey ? "Поиск адресов…" : null}
                {!isAddressLookupLoading && isGeocodeLoading ? "Поиск координат…" : null}
                {!isAddressLookupLoading && !isGeocodeLoading && addressStatus === "google" ? "Адрес из Google" : null}
                {!isAddressLookupLoading && !isGeocodeLoading && addressStatus === "geocoded" ? "Координаты обновлены" : null}
                {!isAddressLookupLoading && !isGeocodeLoading && addressStatus === "manual" ? "Точка задана вручную" : null}
                {!isAddressLookupLoading && !isGeocodeLoading && addressError ? addressError : null}
                {!mapsApiKey ? mapsConfigError : null}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {editLat != null && editLng != null ? "Координаты заданы" : "Координаты не заданы"}
                </span>
                {mapsApiKey ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-600 hover:underline"
                    onClick={() => setIsMapEnabled(!isMapEnabled)}
                  >
                    {isMapEnabled ? "Скрыть карту" : "Показать карту"}
                  </button>
                ) : null}
              </div>
              {editLat != null && editLng != null && mapsApiKey && isMapEnabled && isGoogleLoaded ? (
                <div className="mt-2 h-44 overflow-hidden rounded-md border border-zinc-200">
                  <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={{ lat: editLat, lng: editLng }}
                    zoom={15}
                  >
                    <Marker
                      position={{ lat: editLat, lng: editLng }}
                      draggable
                      onDragEnd={(e) => void handleMarkerDragEnd(e, false)}
                    />
                  </GoogleMap>
                </div>
              ) : null}
            </div>
          </div>
        </section>
        <div className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-3 text-sm">
          <span className={labelClass}>Останній візит</span>
          <div className="flex items-center gap-3">
            <span className="text-zinc-900">
              {company!.lastVisitAt
                ? new Date(company!.lastVisitAt).toLocaleString()
                : <span className="font-normal text-zinc-400">Нет визитов</span>}
            </span>
            <button
              type="button"
              onClick={() => void scheduleVisit()}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Запланировать встречу
            </button>
          </div>
        </div>
        <div className="border-t border-zinc-100 pt-3">
          <div className="text-sm font-medium text-zinc-700 mb-2">Контакты</div>
          {loadingContacts ? (
            <p className="text-xs text-zinc-500">Загрузка…</p>
          ) : companyContacts.length === 0 ? (
            <p className="text-xs text-zinc-500">Нет привязанных контактов</p>
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
                        {c.firstName} {c.lastName}
                      </span>
                      {onOpenContact ? (
                        <span className="shrink-0 text-zinc-400" aria-hidden>→</span>
                      ) : null}
                    </div>
                    {c.phone ? (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{c.phone}</div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pt-2 text-xs text-zinc-500">
          Created: {new Date(company!.createdAt).toLocaleString()}
          <br />
          Updated: {new Date(company!.updatedAt).toLocaleString()}
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
    onClose,
    save,
    patchCompany,
    loadingContacts,
    companyContacts,
    onOpenContact,
    scheduleVisit,
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
            ? "Main"
            : tab === "orders"
              ? "Orders"
              : tab === "contacts"
                ? "Contacts"
                : tab === "tasks"
                  ? "Tasks"
                  : "Change history"}
        </button>
      ))}
    </div>
  );

  const leftContent = (
    <div className="min-h-0 overflow-auto">
      {leftTab === "main" && (
        isCreate ? (
          <div className="min-h-0 overflow-auto">
            <EntitySection title="About company">{aboutCompanySection}</EntitySection>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
            <div className="min-h-0 overflow-auto border-zinc-200 lg:border-r lg:pr-4">
              <EntitySection title="About company">{aboutCompanySection}</EntitySection>
            </div>
            <div className="min-h-0 overflow-auto pt-4 lg:pt-0 lg:pl-4">
              <EntitySection title="Activity">
                <CompanyTimeline apiBaseUrl={apiBaseUrl} companyId={companyId} />
              </EntitySection>
            </div>
          </div>
        )
      )}

      {leftTab === "orders" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Save the company first to see orders.</p>
          ) : (
            <EntitySection title="Orders">
              <div className="min-h-0 overflow-auto">
                <EntityOrdersList
                  key={ordersReloadKey}
                  apiBaseUrl={apiBaseUrl}
                  query={`companyId=${companyId}&pageSize=50`}
                  onOpenOrder={(id) => setOrderId(id)}
                />
              </div>
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "contacts" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Save the company first to link contacts.</p>
          ) : (
            <EntitySection
              title="Contacts"
              rightAction={
                <button
                  type="button"
                  onClick={() =>
                    linkContactOpen ? setLinkContactOpen(false) : openLinkContact()
                  }
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {linkContactOpen ? "Cancel" : "Link contact"}
                </button>
              }
            >
              {linkContactOpen ? (
                <div className="mt-2">
                  {loadingAllContacts ? (
                    <div className="text-xs text-zinc-500">Loading…</div>
                  ) : allContactsOptions.length === 0 ? (
                    <div className="text-xs text-zinc-500">No contacts</div>
                  ) : (
                    <SearchableSelectLite
                      value={null}
                      options={allContactsOptions}
                      placeholder="Select contact to link…"
                      disabled={!!linkingContactId}
                      onChange={(id) => id != null && void linkContactToCompany(id)}
                    />
                  )}
                </div>
              ) : (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-zinc-200 bg-white">
                  {loadingContacts ? (
                    <div className="p-2 text-xs text-zinc-500">Loading…</div>
                  ) : companyContacts.length === 0 ? (
                    <div className="p-2 text-xs text-zinc-500">No contacts linked</div>
                  ) : (
                    <ul className="divide-y divide-zinc-100 text-sm">
                      {companyContacts.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            {c.firstName} {c.lastName}
                            {c.phone ? ` — ${c.phone}` : ""}
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
                              title="Remove from company"
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
            <p className="text-sm text-zinc-500">Save the company first to manage tasks.</p>
          ) : (
            <EntitySection title="Tasks">
              <EntityTasksList companyId={companyId} />
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "change-history" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Save the company first to see change history.</p>
          ) : (
            <EntitySection title="Change history">
              {loadingChangeHistory ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : changeHistoryError ? (
                <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {changeHistoryError}
                </div>
              ) : changeHistory.length === 0 ? (
                <p className="text-sm text-zinc-500">No change history yet.</p>
              ) : (
                <div className="space-y-3">
                  {changeHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-md border border-zinc-200 bg-white p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 text-zinc-500">
                        <span className="font-medium capitalize">{entry.action.toLowerCase()}</span>
                        <span className="text-xs">
                          {new Date(entry.createdAt).toLocaleString()}
                          {entry.changedBy ? ` · User ${entry.changedBy}` : ""}
                        </span>
                      </div>
                      {entry.payload.length > 0 && (
                        <ul className="mt-2 space-y-1 text-zinc-700">
                          {entry.payload.map((p, i) => {
                            const label =
                              p.field === "name"
                                ? "Название"
                                : p.field === "edrpou"
                                  ? "ЄДРПОУ"
                                  : p.field === "taxId"
                                    ? "ІПН"
                                    : p.field === "phone"
                                      ? "Телефон"
                                      : p.field === "address"
                                        ? "Адрес"
                                        : p.field === "lat"
                                          ? "Широта"
                                          : p.field === "lng"
                                            ? "Долгота"
                                            : p.field === "googlePlaceId"
                                              ? "Google Place"
                                              : p.field;
                            const oldV = p.oldValue ?? "—";
                            const newV = p.newValue ?? "—";
                            return (
                              <li key={i}>
                                {label}: {oldV} → {newV}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
            <button
              type="button"
              disabled={loading || !!err || creatingOrder}
              onClick={() => void createOrder()}
              className="btn-primary py-1.5"
            >
              {creatingOrder ? "Creating…" : "+ Order"}
            </button>
          ) : null
        }
        tabsUnderHeader={tabsUnderHeader}
        left={leftContent}
        right={null}
        footer={null}
        canClose={canClose}
        onClose={onClose}
        onEscape={handleEscape}
      />

      {orderId ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          onClose={() => setOrderId(null)}
          onSaved={() => {
            setOrderId(null);
            setOrdersReloadKey((x) => x + 1);
          }}
        />
      ) : null}
    </>
  );
}
