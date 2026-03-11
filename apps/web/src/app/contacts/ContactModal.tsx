"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { InlineEditableField } from "@/components/fields/InlineEditableField";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { OrderModal } from "../orders/OrderModal";
import { ContactTimeline } from "./ContactTimeline";
import { EntityTasksList } from "@/components/EntityTasksList";
import { NpCitySelect, NpWarehouseSelect } from "@/components/inputs/NpDirectorySelects";
import { apiHttp } from "../../lib/api/client";
import { visitsApi } from "@/lib/api";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import {
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";

type GoogleMapsPublicConfig = {
  mapsApiKey: string | null;
};

/** Loads Google Maps JS only for map + marker (no legacy Places). */
function ContactGoogleScriptLoader({
  mapsApiKey,
  onState,
}: {
  mapsApiKey: string;
  onState: (state: { isLoaded: boolean; loadError: Error | undefined }) => void;
}) {
  const { isLoaded, loadError } = useLoadScript({
    id: "google-map-script",
    googleMapsApiKey: mapsApiKey,
  });

  useEffect(() => {
    onState({ isLoaded, loadError: loadError ?? undefined });
  }, [isLoaded, loadError, onState]);

  return null;
}

type ShippingProfile = {
  id: string;
  label?: string | null;
  isDefault?: boolean | null;
  deliveryType?: string | null;
  recipientType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  cityRef?: string | null;
  cityName?: string | null;
  warehouseRef?: string | null;
  warehouseNumber?: string | null;
};

function AddShippingProfileModal({
  contactId,
  profileId,
  initialData,
  defaultPerson,
  onClose,
  onSaved,
}: {
  contactId: string;
  profileId?: string;
  initialData?: ShippingProfile | null;
  /** When adding (no initialData), pre-fill person fields from contact if no profiles yet */
  defaultPerson?: { firstName?: string; lastName?: string; phone?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!profileId && !!initialData;
  const defaultLabel =
    initialData?.label ??
    (defaultPerson?.lastName || defaultPerson?.firstName
      ? [defaultPerson.lastName, defaultPerson.firstName].filter(Boolean).join(" ").trim()
      : "");
  const [label, setLabel] = useState(defaultLabel);
  const [recipientType, setRecipientType] = useState<"PERSON" | "COMPANY">(
    (initialData?.recipientType as "PERSON" | "COMPANY") ?? "PERSON",
  );
  const [deliveryType, setDeliveryType] = useState<"WAREHOUSE" | "POSTOMAT" | "ADDRESS">(
    (initialData?.deliveryType as "WAREHOUSE" | "POSTOMAT" | "ADDRESS") ?? "WAREHOUSE",
  );
  const [firstName, setFirstName] = useState(
    initialData?.firstName ?? defaultPerson?.firstName ?? "",
  );
  const [lastName, setLastName] = useState(initialData?.lastName ?? defaultPerson?.lastName ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? defaultPerson?.phone ?? "");
  const [cityRef, setCityRef] = useState(initialData?.cityRef ?? "");
  const [cityName, setCityName] = useState(initialData?.cityName ?? "");
  const [warehouseRef, setWarehouseRef] = useState(initialData?.warehouseRef ?? "");
  const [warehouseLabel, setWarehouseLabel] = useState(
    initialData?.warehouseNumber ? `${initialData.warehouseNumber} — ${initialData.cityName ?? ""}` : "",
  );
  const [warehouseNumber, setWarehouseNumber] = useState(initialData?.warehouseNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !cityRef) {
      setError("Select a city from the directory.");
      return;
    }
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !warehouseRef) {
      setError("Select a warehouse from the directory.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: trimmedLabel,
        recipientType,
        deliveryType,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null,
        cityRef: cityRef.trim() || null,
        cityName: cityName.trim() || null,
        warehouseRef: warehouseRef.trim() || null,
        warehouseNumber: warehouseNumber.trim() || null,
      };
      if (isEdit && profileId) {
        await apiHttp.patch(`/contacts/${contactId}/shipping-profiles/${profileId}`, payload);
      } else {
        await apiHttp.post(`/contacts/${contactId}/shipping-profiles`, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to create profile");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 py-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">
              {isEdit ? "Edit delivery profile" : "Add delivery profile"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              ✕
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="space-y-3">
          {error && (
            <div className="rounded-md border border-red-100 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-600">Label *</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              placeholder="e.g. Home, Office"
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Recipient type</label>
            <select
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as "PERSON" | "COMPANY")}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              disabled={saving}
            >
              <option value="PERSON">Person</option>
              <option value="COMPANY">Company</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Delivery type</label>
            <select
              value={deliveryType}
              onChange={(e) =>
                setDeliveryType(e.target.value as "WAREHOUSE" | "POSTOMAT" | "ADDRESS")
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              disabled={saving}
            >
              <option value="WAREHOUSE">Warehouse</option>
              <option value="POSTOMAT">Postomat</option>
              <option value="ADDRESS">Address</option>
            </select>
          </div>
          {recipientType === "PERSON" && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-600">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              City (from directory)
            </label>
            <NpCitySelect
              valueRef={cityRef}
              valueLabel={cityName}
              onChange={(ref, name) => {
                setCityRef(ref);
                setCityName(name);
                if (deliveryType !== "ADDRESS") {
                  setWarehouseRef("");
                  setWarehouseLabel("");
                  setWarehouseNumber("");
                }
              }}
              disabled={saving}
              placeholder="Type at least 2 characters…"
            />
          </div>
          {(deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && (
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                {deliveryType === "POSTOMAT"
                  ? "Postomat (from directory)"
                  : "Warehouse (from directory)"}
              </label>
              <NpWarehouseSelect
                key={deliveryType}
                cityRef={cityRef}
                type={deliveryType}
                valueRef={warehouseRef}
                valueLabel={warehouseLabel}
                onChange={(ref, lbl, num) => {
                  setWarehouseRef(ref);
                  setWarehouseLabel(lbl);
                  setWarehouseNumber(num ?? "");
                }}
                disabled={saving}
                placeholder="Type to search…"
              />
            </div>
          )}
            </div>
          </div>
          <div className="shrink-0 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving…" : "Add profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactDeliveryProfilesTab({
  isCreate,
  contactId,
  contactPerson,
}: {
  isCreate: boolean;
  apiBaseUrl: string;
  contactId: string;
  contactPerson?: { firstName: string; lastName: string; phone: string };
}) {
  const [profiles, setProfiles] = useState<ShippingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ShippingProfile | null>(null);

  const loadProfiles = useCallback(() => {
    if (isCreate) return;
    setLoading(true);
    apiHttp
      .get<{ items?: ShippingProfile[] } | ShippingProfile[]>(
        `/contacts/${contactId}/shipping-profiles`,
      )
      .then((res) => {
        const data = res.data;
        setProfiles(Array.isArray(data) ? data : data?.items ?? []);
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [isCreate, contactId]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  if (isCreate) {
    return <p className="text-sm text-zinc-500">Save the contact first to see delivery profiles.</p>;
  }
  if (loading && profiles.length === 0) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  return (
    <>
      <EntitySection
        title="Delivery profiles"
        rightAction={
          <button
            type="button"
            onClick={() => {
              setEditingProfile(null);
              setAddModalOpen(true);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Add profile
          </button>
        }
      >
        {profiles.length === 0 ? (
          <p className="text-sm text-zinc-500">No delivery profiles yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.label || "Unnamed"}</span>
                  {p.isDefault && (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs">Default</span>
                  )}
                  {(p.cityName || p.warehouseNumber) && (
                    <div className="mt-1 text-xs text-zinc-500">
                      {[p.cityName, p.warehouseNumber].filter(Boolean).join(" • ")}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddModalOpen(false);
                      setEditingProfile(p);
                    }}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    title="Edit"
                    aria-label="Edit profile"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Delete profile "${p.label || "Unnamed"}"?`)) return;
                      apiHttp
                        .delete(`/contacts/${contactId}/shipping-profiles/${p.id}`)
                        .then(() => loadProfiles())
                        .catch(() => {});
                    }}
                    className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                    aria-label="Delete profile"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      </EntitySection>
      {(addModalOpen || editingProfile) && (
        <AddShippingProfileModal
          key={editingProfile?.id ?? "add"}
          contactId={contactId}
          profileId={editingProfile?.id}
          initialData={editingProfile ?? undefined}
          defaultPerson={
            !editingProfile && profiles.length === 0 && contactPerson
              ? contactPerson
              : undefined
          }
          onClose={() => {
            setAddModalOpen(false);
            setEditingProfile(null);
          }}
          onSaved={loadProfiles}
        />
      )}
    </>
  );
}

type ContactPhone = {
  id: string;
  phone: string;
  phoneNormalized: string;
  label: string | null;
};

function ContactPhonesSection({
  contactId,
  additionalPhones,
  onUpdated,
  saving,
}: {
  contactId: string;
  additionalPhones: ContactPhone[];
  onUpdated: () => void;
  saving: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = addPhone.trim();
    if (!phone) {
      setAddError("Введите номер");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      await apiHttp.post(`/contacts/${contactId}/phones`, { phone, label: addLabel.trim() || undefined });
      setAddOpen(false);
      setAddPhone("");
      setAddLabel("");
      onUpdated();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : "Ошибка");
      setAddError(msg);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (phoneId: string) => {
    setMutatingId(phoneId);
    try {
      await apiHttp.delete(`/contacts/${contactId}/phones/${phoneId}`);
      onUpdated();
    } finally {
      setMutatingId(null);
    }
  };

  const handleSetPrimary = async (phoneId: string) => {
    setMutatingId(phoneId);
    try {
      await apiHttp.post(`/contacts/${contactId}/phones/${phoneId}/set-primary`);
      onUpdated();
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <div className="space-y-1 py-1">
      <label className="text-sm text-zinc-500">Доп. номера</label>
      <ul className="space-y-1 text-sm">
        {additionalPhones.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/50 px-2 py-1.5">
            <span>
              {p.phone}
              {p.label ? <span className="ml-1 text-zinc-500">({p.label})</span> : null}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                onClick={() => handleSetPrimary(p.id)}
                disabled={saving || mutatingId !== null}
              >
                Сделать основным
              </button>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
                onClick={() => handleDelete(p.id)}
                disabled={saving || mutatingId !== null}
              >
                Удалить
              </button>
            </span>
          </li>
        ))}
      </ul>
      {!addOpen ? (
        <button
          type="button"
          className="mt-1 text-sm text-blue-600 hover:underline disabled:opacity-50"
          onClick={() => setAddOpen(true)}
          disabled={saving}
        >
          + Добавить номер
        </button>
      ) : (
        <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded border border-zinc-200 bg-white p-2">
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <input
            type="text"
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
            placeholder="Номер телефона"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Метка (моб., рабочий…)"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" className="text-sm text-zinc-600 hover:underline" onClick={() => setAddOpen(false)}>
              Отмена
            </button>
            <button type="submit" className="text-sm text-blue-600 hover:underline" disabled={addSaving}>
              {addSaving ? "Сохранение…" : "Добавить"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

type Contact = {
  id: string;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  ownerId?: string | null;
  owner?: { id: string; fullName: string; email: string } | null;
  externalCode?: string | null;
  region?: string | null;
  addressInfo?: string | null;
  city?: string | null;
  clientType?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  lastVisitAt?: string | null;
  telegramLinked?: boolean;
  telegramUsername?: string | null;
  telegramLastMessageAt?: string | null;
  telegramConversationId?: string | null;
  phones?: ContactPhone[];
};

type Props = {
  apiBaseUrl: string;
  contactId: string; // "new"
  onClose: () => void;
  onUpdate: () => void;
  onOpenCompany?: (id: string) => void;
};

export function ContactModal({ apiBaseUrl, contactId, onClose, onUpdate, onOpenCompany }: Props) {
  const isCreate = contactId === "new";

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [addressStatus, setAddressStatus] = useState<"google" | "geocoded" | "manual" | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);
  const [isMapEnabled, setIsMapEnabled] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false);
  const [isGeocodeLoading, setIsGeocodeLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const addressBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedAddressRef = useRef<string>("");
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [externalCode, setExternalCode] = useState("");
  const [region, setRegion] = useState("");
  const [addressInfo, setAddressInfo] = useState("");
  const [city, setCity] = useState("");
  const [clientType, setClientType] = useState("");

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [users, setUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    tempPassword: string;
    setPasswordToken: string;
  } | null>(null);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  type LeftTabId = "main" | "orders" | "delivery-profiles" | "tasks" | "change-history";
  const [leftTab, setLeftTab] = useState<LeftTabId>("main");

  const cancelInlineEditRef = useRef<(() => void) | null>(null);

  const canClose = !saving;

  const title = useMemo(() => (isCreate ? "New contact" : "Contact"), [isCreate]);

  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<Error | undefined>(undefined);

  const toggleMap = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsMapEnabled(!isMapEnabled);
    },
    [isMapEnabled],
  );

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; name: string }[] }>(
        "/companies?page=1&pageSize=200",
      );
      setCompanies(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; fullName: string; email: string }[] }>(
        "/users",
      );
      setUsers(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

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

  const refresh = useCallback(async () => {
    if (isCreate) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<Contact>(`/contacts/${contactId}`);
      const data = res.data as Contact;
      setContact(data);
      setFirstName(data.firstName ?? "");
      setLastName(data.lastName ?? "");
      setPhone(data.phone ?? "");
      setEmail((data.email ?? "") as string);
      setPosition((data.position ?? "") as string);
      setAddress((data.address ?? "") as string);
      setLat(data.lat ?? null);
      setLng(data.lng ?? null);
      setGooglePlaceId(data.googlePlaceId ?? null);
      setAddressStatus(null);
      setOwnerId(data.ownerId ?? null);
      setCompanyId(data.companyId ?? null);
      setExternalCode((data.externalCode ?? "") as string);
      setRegion((data.region ?? "") as string);
      setAddressInfo((data.addressInfo ?? "") as string);
      setCity((data.city ?? "") as string);
      setClientType((data.clientType ?? "") as string);
      await Promise.all([fetchCompanies(), fetchUsers()]);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to load contact");
      setContact(null);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [contactId, isCreate, fetchCompanies, fetchUsers]);

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
    setErr(null);
    setContact(null);
    setOrderId(null);
    setCreateOrderOpen(false);
     setIsMapEnabled(false);
    if (isCreate) {
      setLoading(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setPosition("");
      setAddress("");
      setLat(null);
      setLng(null);
      setGooglePlaceId(null);
      setAddressStatus(null);
      setOwnerId(null);
      setCompanyId(null);
      setExternalCode("");
      setRegion("");
      setAddressInfo("");
      setCity("");
      setClientType("");
      void Promise.all([fetchCompanies(), fetchUsers()]);
      return;
    }
    void refresh();
  }, [isCreate, refresh, fetchCompanies, fetchUsers]);

  const patchContact = useCallback(
    async (payload: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      position: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
      googlePlaceId: string | null;
      ownerId: string | null;
      companyId: string | null;
      externalCode: string | null;
      region: string | null;
      addressInfo: string | null;
      city: string | null;
      clientType: string | null;
    }>) => {
      const res = await apiHttp.patch<Contact>(`/contacts/${contactId}`, payload);
      const data = res.data as Contact;
      setContact((prev) => (prev ? { ...data, phones: (data as Contact).phones ?? prev.phones ?? [] } : data));
      if (payload.firstName !== undefined) setFirstName(payload.firstName);
      if (payload.lastName !== undefined) setLastName(payload.lastName);
      if (payload.phone !== undefined) setPhone(payload.phone);
      if (payload.email !== undefined) setEmail(payload.email ?? "");
      if (payload.position !== undefined) setPosition(payload.position ?? "");
      if (payload.address !== undefined) setAddress(payload.address ?? "");
      if (payload.region !== undefined) setRegion(payload.region ?? "");
      if (payload.addressInfo !== undefined) setAddressInfo(payload.addressInfo ?? "");
      if (payload.city !== undefined) setCity(payload.city ?? "");
      if (payload.clientType !== undefined) setClientType(payload.clientType ?? "");
      if (payload.lat !== undefined) setLat(payload.lat ?? null);
      if (payload.lng !== undefined) setLng(payload.lng ?? null);
      if (payload.googlePlaceId !== undefined) setGooglePlaceId(payload.googlePlaceId ?? null);
      if (payload.ownerId !== undefined) setOwnerId(payload.ownerId);
      if (payload.companyId !== undefined) setCompanyId(payload.companyId);
      onUpdate();
    },
    [contactId, onUpdate],
  );

  useEffect(
    () => () => {
      if (addressBlurTimeoutRef.current) {
        clearTimeout(addressBlurTimeoutRef.current);
      }
    },
    [],
  );

  const persistAddressIfChanged = useCallback(async () => {
    if (isCreate || !contact) return;
    const nextAddress = address.trim() || null;
    const sameAddress = (contact.address ?? null) === nextAddress;
    const sameLat = (contact.lat ?? null) === (lat ?? null);
    const sameLng = (contact.lng ?? null) === (lng ?? null);
    const samePlaceId = (contact.googlePlaceId ?? null) === (googlePlaceId ?? null);
    if (sameAddress && sameLat && sameLng && samePlaceId) return;
    await patchContact({
      address: nextAddress,
      lat: lat ?? null,
      lng: lng ?? null,
      googlePlaceId: googlePlaceId ?? null,
    });
  }, [address, contact, googlePlaceId, isCreate, lat, lng, patchContact]);

  const handleSelectAddressSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!mapsApiKey) return;
      setAddress(suggestion.description);
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
        setLat(result.lat);
        setLng(result.lng);
        setGooglePlaceId(result.placeId);
        setAddress(result.formattedAddress || suggestion.description);
        setAddressStatus("google");
        if (!isCreate) {
          try {
            await patchContact({
              address: result.formattedAddress || suggestion.description,
              lat: result.lat,
              lng: result.lng,
              googlePlaceId: result.placeId,
            });
          } catch {
            // keep local values
          }
        }
      } catch {
        setAddressError("Address service temporarily unavailable.");
        console.warn("Places API (New): geocode place failed for", suggestion.placeId);
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [isCreate, mapsApiKey, patchContact],
  );

  const geocodeFromAddressText = useCallback(
    async (rawAddress: string) => {
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
        setLat(result.lat);
        setLng(result.lng);
        setGooglePlaceId(result.placeId);
        setAddress(result.formattedAddress || query);
        setAddressStatus("geocoded");
        if (!isCreate) {
          try {
            await patchContact({
              address: result.formattedAddress || query,
              lat: result.lat,
              lng: result.lng,
              googlePlaceId: result.placeId,
            });
          } catch {
            // noop
          }
        }
      } catch {
        setAddressError("Address service temporarily unavailable.");
        console.warn("Places API (New): geocode text failed for", query);
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [isCreate, mapsApiKey, patchContact],
  );

  useEffect(() => {
    if (!showAddressSuggestions || !mapsApiKey) {
      setAddressSuggestions([]);
      return;
    }
    const query = address.trim();
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
      } catch (e) {
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions([]);
        setAddressError("Address service temporarily unavailable.");
        console.warn("Places API (New): autocomplete failed for", query);
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
  }, [address, showAddressSuggestions, mapsApiKey]);

  const handleMarkerDragEnd = useCallback(
    async (e: google.maps.MapMouseEvent) => {
      const nextLat = e.latLng?.lat();
      const nextLng = e.latLng?.lng();
      if (nextLat == null || nextLng == null) return;
      setLat(nextLat);
      setLng(nextLng);
      setAddressStatus("manual");
      if (!isCreate) {
        await patchContact({
          lat: nextLat,
          lng: nextLng,
          googlePlaceId: googlePlaceId ?? null,
          address: address.trim() || null,
        });
      }
    },
    [address, googlePlaceId, isCreate, patchContact],
  );

  const handleEscape = useCallback(() => {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current();
      cancelInlineEditRef.current = null;
      return true;
    }
    if (orderId) {
      setOrderId(null);
      return true;
    }
    if (createOrderOpen) {
      setCreateOrderOpen(false);
      return true;
    }
    return false;
  }, [orderId, createOrderOpen]);

  const saveCreate = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        position: position.trim() || null,
        externalCode: externalCode.trim() || null,
        region: region.trim() || null,
        addressInfo: addressInfo.trim() || null,
        city: city.trim() || null,
        clientType: clientType.trim() || null,
        address: address.trim() || null,
        lat,
        lng,
        googlePlaceId,
        ownerId: ownerId || null,
        companyId: companyId || null,
      };
      if (!payload.firstName) throw new Error("First name is required");
      if (!payload.lastName) throw new Error("Last name is required");
      if (!payload.phone) throw new Error("Phone is required");
      await apiHttp.post("/contacts", payload);
      onUpdate();
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const scheduleVisit = async () => {
    if (!contact) return;
    try {
      await visitsApi.create({
        contactId: contact.id,
        companyId: contact.companyId ?? undefined,
        title: `${contact.firstName} ${contact.lastName}`.trim() || "Visit",
        phone: contact.phone ?? undefined,
        addressText: contact.address ?? undefined,
        lat: contact.lat ?? undefined,
        lng: contact.lng ?? undefined,
      });
      alert("Visit added to planned backlog.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to schedule visit");
    }
  };

  const fullName = useMemo(() => {
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    return `${a} ${b}`.trim() || null;
  }, [contact]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: c.id, label: c.name })),
    [companies],
  );

  const companyOptionsWithEmpty = useMemo(
    () => [{ id: "", label: "— No company" }, ...companyOptions],
    [companyOptions],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, label: u.fullName || u.email })),
    [users],
  );

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelInlineEditRef.current = cancel;
  }, []);

  const aboutContactSection = useMemo(() => {
    if (loading) {
      return <div className="text-sm text-zinc-500">Loading…</div>;
    }
    if (err) {
      return (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      );
    }

    if (isCreate) {
      return (
        <>
          <label className="block text-sm font-medium text-zinc-700">First name</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="John"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Last name</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Phone</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1…"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Email</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@example.com"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Position</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Manager"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">КОД 1С</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            placeholder="Код 1С"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Область</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Область"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Адрес (инфо)</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={addressInfo}
            onChange={(e) => setAddressInfo(e.target.value)}
            placeholder="Адрес (инфо)"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Город</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Тип клиента</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={clientType}
            onChange={(e) => setClientType(e.target.value)}
            placeholder="Врач / техник"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Address</label>
          <div className="mt-1 space-y-2">
            <div className="relative">
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  lastGeocodedAddressRef.current = "";
                  if (googlePlaceId) setGooglePlaceId(null);
                  setAddressStatus(null);
                  setAddressError(null);
                }}
                onFocus={() => setShowAddressSuggestions(true)}
                onBlur={() => {
                  addressBlurTimeoutRef.current = setTimeout(() => {
                    setShowAddressSuggestions(false);
                  }, 120);
                  if (address.trim().length >= 3 && mapsApiKey) {
                    void geocodeFromAddressText(address);
                  }
                }}
                placeholder="Street, city, index"
                disabled={saving}
              />
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void handleSelectAddressSuggestion(suggestion);
                      }}
                    >
                      {suggestion.description}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              {isAddressLookupLoading && mapsApiKey ? "Searching addresses…" : null}
              {!isAddressLookupLoading && isGeocodeLoading
                ? "Searching coordinates from address…"
                : null}
              {!isAddressLookupLoading && addressStatus === "google"
                ? "Address selected from Google (Places API New)"
                : null}
              {!isAddressLookupLoading && addressStatus === "geocoded"
                ? "Address coordinates updated"
                : null}
              {!isAddressLookupLoading && addressStatus === "manual" ? "Pin adjusted manually" : null}
              {!isAddressLookupLoading && addressError ? addressError : null}
              {!isAddressLookupLoading && !addressError && !mapsApiKey ? mapsConfigError : null}
              {!isAddressLookupLoading && !addressError && mapsApiKey && googleLoadError
                ? "Google Maps script failed to load."
                : null}
            </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {lat != null && lng != null ? "Координаты установлены" : "Координаты не заданы"}
            </span>
            {mapsApiKey ? (
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:underline"
                onClick={toggleMap}
              >
                {isMapEnabled ? "Скрыть карту" : "Показать карту"}
              </button>
            ) : null}
          </div>
          {lat != null && lng != null && isGoogleLoaded && mapsApiKey && isMapEnabled ? (
              <div className="h-44 overflow-hidden rounded-md border border-zinc-200">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={{ lat, lng }}
                  zoom={15}
                >
                  <Marker position={{ lat, lng }} draggable onDragEnd={(e) => void handleMarkerDragEnd(e)} />
                </GoogleMap>
              </div>
          ) : null}
          </div>
          <label className="mt-3 block text-sm font-medium text-zinc-700">Responsible manager</label>
          <div className="mt-1">
            <SearchableSelectLite
              value={ownerId}
              options={userOptions}
              placeholder="— Not assigned"
              disabled={saving || loadingUsers}
              isLoading={loadingUsers}
              onChange={(id) => setOwnerId(id)}
            />
          </div>
          <label className="mt-3 block text-sm font-medium text-zinc-700">Company</label>
          <div className="mt-1 flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelectLite
                value={companyId ?? ""}
                options={companyOptionsWithEmpty}
                placeholder="— No company"
                disabled={saving || loadingCompanies}
                isLoading={loadingCompanies}
                onChange={(id) => setCompanyId(id === "" ? null : id)}
              />
            </div>
            {companyId && onOpenCompany ? (
              <button
                type="button"
                onClick={() => onOpenCompany(companyId)}
                className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Open company
              </button>
            ) : null}
            {onOpenCompany ? (
              <button
                type="button"
                onClick={() => onOpenCompany("new")}
                className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Create company
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void scheduleVisit()}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Запланировать встречу
            </button>
          </div>
        </>
      );
    }

    if (!contact) {
      return <div className="text-sm text-zinc-500">Not found</div>;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Last visit</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-900">
              {contact.lastVisitAt
                ? new Date(contact.lastVisitAt).toLocaleString()
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
        <div className="flex flex-wrap items-center gap-2 py-2">
          {contact.telegramLinked ? (
            <>
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                Telegram подключен
                {contact.telegramUsername ? ` @${contact.telegramUsername}` : ""}
              </span>
              {contact.telegramConversationId && (
                <a
                  href={`/inbox/telegram?conversationId=${contact.telegramConversationId}`}
                  className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Открыть Telegram чат
                </a>
              )}
            </>
          ) : (
            <span className="text-xs text-zinc-500">Telegram не подключен</span>
          )}
        </div>
        <InlineEditableField
          label="First name"
          value={contact.firstName}
          placeholder="Click to add…"
          kind="text"
          required
          disabled={saving}
          onSave={async (next) => {
            const v = next ?? "";
            await patchContact({ firstName: v });
          }}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Last name"
          value={contact.lastName}
          placeholder="Click to add…"
          kind="text"
          required
          disabled={saving}
          onSave={async (next) => {
            const v = next ?? "";
            await patchContact({ lastName: v });
          }}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Phone (основной)"
          value={contact.phone}
          placeholder="Click to add…"
          kind="text"
          required
          disabled={saving}
          onSave={async (next) => {
            const v = next ?? "";
            await patchContact({ phone: v });
          }}
          onRegisterCancel={registerCancel}
        />
        {!isCreate && (
          <ContactPhonesSection
            contactId={contact.id}
            additionalPhones={contact.phones ?? []}
            onUpdated={refresh}
            saving={saving}
          />
        )}
        <InlineEditableField
          label="Email"
          value={contact.email ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ email: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Position"
          value={contact.position ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ position: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="КОД 1С"
          value={contact.externalCode ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ externalCode: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Область"
          value={contact.region ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ region: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Адрес (инфо)"
          value={contact.addressInfo ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ addressInfo: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Город"
          value={contact.city ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ city: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Тип клиента"
          value={contact.clientType ?? ""}
          placeholder="Врач / техник"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ clientType: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <div className="space-y-1 py-1">
          <label className="text-sm text-zinc-500">Address</label>
          <div className="relative">
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                lastGeocodedAddressRef.current = "";
                if (googlePlaceId) setGooglePlaceId(null);
                setAddressStatus(null);
                setAddressError(null);
              }}
              onFocus={() => setShowAddressSuggestions(true)}
              onBlur={() => {
                addressBlurTimeoutRef.current = setTimeout(() => {
                  setShowAddressSuggestions(false);
                }, 120);
                if (address.trim().length >= 3 && mapsApiKey) {
                  void geocodeFromAddressText(address);
                }
                void persistAddressIfChanged();
              }}
              placeholder="Click to add…"
              disabled={saving}
            />
            {showAddressSuggestions && addressSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                {addressSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.placeId}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void handleSelectAddressSuggestion(suggestion);
                    }}
                  >
                    {suggestion.description}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            {isAddressLookupLoading && mapsApiKey ? "Searching addresses…" : null}
            {!isAddressLookupLoading && isGeocodeLoading
              ? "Searching coordinates from address…"
              : null}
            {!isAddressLookupLoading && addressStatus === "google"
              ? "Address selected from Google (Places API New)"
              : null}
            {!isAddressLookupLoading && addressStatus === "geocoded"
              ? "Address coordinates updated"
              : null}
            {!isAddressLookupLoading && addressStatus === "manual" ? "Pin adjusted manually" : null}
            {!isAddressLookupLoading && addressError ? addressError : null}
            {!isAddressLookupLoading && !addressError && !mapsApiKey ? mapsConfigError : null}
            {!isAddressLookupLoading && !addressError && mapsApiKey && googleLoadError
              ? "Google Maps script failed to load."
              : null}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {lat != null && lng != null ? "Координаты установлены" : "Координаты не заданы"}
            </span>
            {mapsApiKey ? (
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:underline"
                onClick={toggleMap}
              >
                {isMapEnabled ? "Скрыть карту" : "Показать карту"}
              </button>
            ) : null}
          </div>
          {lat != null && lng != null && isGoogleLoaded && mapsApiKey && isMapEnabled ? (
            <div className="h-44 overflow-hidden rounded-md border border-zinc-200">
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={{ lat, lng }}
                zoom={15}
              >
                <Marker position={{ lat, lng }} draggable onDragEnd={(e) => void handleMarkerDragEnd(e)} />
              </GoogleMap>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Responsible manager</span>
          <SearchableSelectLite
            variant="inline"
            value={ownerId}
            options={userOptions}
            placeholder="Click to add…"
            disabled={saving || loadingUsers}
            isLoading={loadingUsers}
            onChange={async (id) => {
              setOwnerId(id);
              await patchContact({ ownerId: id });
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Company</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <SearchableSelectLite
              variant="inline"
              value={companyId ?? ""}
              options={companyOptionsWithEmpty}
              placeholder="Click to add…"
              disabled={saving || loadingCompanies}
              isLoading={loadingCompanies}
              onChange={async (id) => {
                const next = id === "" ? null : id;
                setCompanyId(next);
                await patchContact({ companyId: next });
              }}
              onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
              createLabel="Create company"
            />
            {onOpenCompany && companyId ? (
              <button
                type="button"
                onClick={() => onOpenCompany(companyId)}
                className="shrink-0 text-sm text-zinc-700 hover:underline"
              >
                Open company
              </button>
            ) : null}
          </div>
        </div>
        <div className="pt-2 text-xs text-zinc-500">
          Created: {new Date(contact.createdAt).toLocaleString()}
          <br />
          Updated: {new Date(contact.updatedAt).toLocaleString()}
        </div>
      </div>
    );
  }, [
    loading,
    err,
    isCreate,
    saving,
    firstName,
    lastName,
    phone,
    email,
    position,
    address,
    lat,
    lng,
    googlePlaceId,
    addressStatus,
    mapsApiKey,
    mapsConfigError,
    isMapEnabled,
    isGoogleLoaded,
    googleLoadError,
    showAddressSuggestions,
    addressSuggestions,
    isAddressLookupLoading,
    isGeocodeLoading,
    addressError,
    companyId,
    companyOptions,
    loadingCompanies,
    contact,
    onOpenCompany,
    patchContact,
    persistAddressIfChanged,
    handleSelectAddressSuggestion,
    handleMarkerDragEnd,
    geocodeFromAddressText,
    registerCancel,
  ]);

  const tabsUnderHeader = (
    <div className="flex gap-1 py-2">
      {(["main", "orders", "delivery-profiles", "tasks", "change-history"] as const).map((tab) => (
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
              : tab === "delivery-profiles"
                ? "Delivery profiles"
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
              <EntitySection
                title="About contact"
              >
                {aboutContactSection}
              </EntitySection>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
              <div className="min-h-0 overflow-auto border-zinc-200 lg:border-r lg:pr-4">
                <EntitySection
                  title="About contact"
                  rightAction={
                    contact?.companyId && onOpenCompany ? (
                      <button
                        type="button"
                        onClick={() => onOpenCompany(contact.companyId!)}
                        className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        Open company
                      </button>
                    ) : null
                  }
                >
                  {aboutContactSection}
                </EntitySection>
              </div>
              <div className="min-h-0 overflow-auto pt-4 lg:pt-0 lg:pl-4">
                <EntitySection title="Activity">
                  <ContactTimeline
                    apiBaseUrl={apiBaseUrl}
                    contactId={contactId}
                    showActivityButtons
                  />
                </EntitySection>
              </div>
            </div>
          )
        )}

        {leftTab === "orders" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Save the contact first to see orders.</p>
            ) : (
              <EntitySection title="Orders">
                <div className="min-h-0 overflow-auto">
                  <EntityOrdersList
                    key={ordersReloadKey}
                    apiBaseUrl={apiBaseUrl}
                    query={`clientId=${contactId}&pageSize=50`}
                    onOpenOrder={(id) => setOrderId(id)}
                  />
                </div>
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "tasks" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Save the contact first to manage tasks.</p>
            ) : (
              <EntitySection title="Tasks">
                <EntityTasksList contactId={contactId} />
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "delivery-profiles" && (
          <ContactDeliveryProfilesTab
            isCreate={isCreate}
            apiBaseUrl={apiBaseUrl}
            contactId={contactId}
            contactPerson={
              contact
                ? {
                    firstName: contact.firstName ?? "",
                    lastName: contact.lastName ?? "",
                    phone: contact.phone ?? "",
                  }
                : undefined
            }
          />
        )}

        {leftTab === "change-history" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Save the contact first to see change history.</p>
            ) : (
              <EntitySection title="Change history">
                <p className="text-sm text-zinc-500">No change history yet.</p>
              </EntitySection>
            )}
          </>
        )}
    </div>
  );

  const footer = isCreate ? (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => onClose()}
        disabled={saving}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void saveCreate()}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  ) : null;

  return (
    <>
      {mapsApiKey && isMapEnabled ? (
        <ContactGoogleScriptLoader
          mapsApiKey={mapsApiKey}
          onState={({ isLoaded, loadError }) => {
            setIsGoogleLoaded(isLoaded);
            setGoogleLoadError(loadError);
          }}
        />
      ) : null}
      <EntityModalShell
        title={title}
        subtitle={!isCreate && fullName ? fullName : undefined}
        headerActions={
          <>
            {!isCreate && (
              <>
                <button
                  type="button"
                  onClick={() => setCreateOrderOpen(true)}
                  className="btn-primary py-1.5"
                >
                  + Order
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setResetPasswordError(null);
                    setResetPasswordResult(null);
                    setResetPasswordLoading(true);
                    try {
                      const res = await apiHttp.post<{
                        tempPassword: string;
                        setPasswordToken: string;
                      }>(`/contacts/${contactId}/reset-store-password`);
                      setResetPasswordResult(res.data);
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : null;
                      setResetPasswordError(
                        msg ?? "У контакта нет аккаунта в магазине или произошла ошибка.",
                      );
                    } finally {
                      setResetPasswordLoading(false);
                    }
                  }}
                  disabled={resetPasswordLoading}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {resetPasswordLoading ? "…" : "Сбросить пароль"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => canClose && onClose()}
              disabled={!canClose}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Close
            </button>
          </>
        }
        tabsUnderHeader={tabsUnderHeader}
        left={leftContent}
        right={null}
        footer={footer}
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
            setOrdersReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {createOrderOpen ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={null}
          prefill={{
            clientId: contactId,
            companyId: contact?.companyId ?? null,
          }}
          onClose={() => setCreateOrderOpen(false)}
          onSaved={() => {
            setCreateOrderOpen(false);
            setOrdersReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {(resetPasswordResult !== null || resetPasswordError !== null) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900">Сброс пароля магазина</h3>
            {resetPasswordError ? (
              <>
                <p className="mt-2 text-sm text-red-600">{resetPasswordError}</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setResetPasswordError(null);
                      setResetPasswordResult(null);
                    }}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Закрыть
                  </button>
                </div>
              </>
            ) : resetPasswordResult ? (
              <>
                <p className="mt-2 text-sm text-zinc-600">
                  Временный пароль и ссылка для установки своего пароля (действует 24 ч):
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="text-xs text-zinc-500">Временный пароль:</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <code className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm font-mono">
                        {resetPasswordResult.tempPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(resetPasswordResult.tempPassword);
                        }}
                        className="shrink-0 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Токен для смены пароля:</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <code className="max-h-20 flex-1 overflow-auto rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-mono break-all">
                        {resetPasswordResult.setPasswordToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(resetPasswordResult.setPasswordToken);
                        }}
                        className="shrink-0 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setResetPasswordError(null);
                      setResetPasswordResult(null);
                    }}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Закрыть
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ContactModal;
