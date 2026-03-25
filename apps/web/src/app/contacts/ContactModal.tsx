"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { InlineEditableField } from "@/components/fields/InlineEditableField";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { OrderModal } from "../orders/OrderModal";
import {
  ContactCardHeaderSubtitleSkeleton,
  ContactCardHeaderTitleSkeleton,
} from "./ContactCardHeaderSkeleton";
import { ContactCardOverviewLayout } from "./ContactCardOverviewLayout";
import { ContactCardTabsUnderHeader } from "./ContactCardTabsUnderHeader";
import { ContactQuickActionsMobileBar } from "./ContactQuickActions";
import { ContactChangeHistory } from "./ContactChangeHistory";
import type { ContactLeftTabId } from "./ContactCardTabBar";
import { ContactOrdersSections } from "./ContactOrdersSections";
import { useContactCard } from "./useContactCard";
import { useContactCardV2Effective } from "./useContactCardV2Effective";
import { getContactAboutStrings, getContactPhonesSectionStrings } from "./contact-about-strings";
import type { ContactPhonesSectionStrings } from "./contact-about-strings";
import { getDeliveryUiStrings } from "./contact-delivery-strings";
import type { DeliveryUiStrings } from "./contact-delivery-strings";
import { getContactModalStrings } from "./contact-modal-strings";
import { EntityTasksList } from "@/components/EntityTasksList";
import { NpCitySelect, NpWarehouseSelect } from "@/components/inputs/NpDirectorySelects";
import { apiHttp } from "../../lib/api/client";
import { contactsApi, type ContactChangeHistoryItem } from "@/lib/api/resources/contacts";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { visitsApi } from "@/lib/api";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import {
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  mergeFormattedAddressWithUserDetail,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";

type GoogleMapsPublicConfig = {
  mapsApiKey: string | null;
};

function buildStoreThankYouSetPasswordUrl(publicStoreBase: string, setPasswordToken: string): string {
  const base = publicStoreBase.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  const u = new URL("/thank-you", withScheme);
  u.searchParams.set("setPasswordToken", setPasswordToken);
  return u.href;
}

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
  strings,
}: {
  contactId: string;
  profileId?: string;
  initialData?: ShippingProfile | null;
  /** When adding (no initialData), pre-fill person fields from contact if no profiles yet */
  defaultPerson?: { firstName?: string; lastName?: string; phone?: string } | null;
  onClose: () => void;
  onSaved: () => void;
  strings: DeliveryUiStrings;
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
      setError(strings.errLabelRequired);
      return;
    }
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !cityRef) {
      setError(strings.errSelectCity);
      return;
    }
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !warehouseRef) {
      setError(strings.errSelectWarehouse);
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
        (e instanceof Error ? e.message : strings.errFailedSave);
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
              {isEdit ? strings.modalTitleEdit : strings.modalTitleAdd}
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
            <label className="block text-xs font-medium text-zinc-600">{strings.labelField}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              placeholder={strings.labelPlaceholder}
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{strings.recipientType}</label>
            <select
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as "PERSON" | "COMPANY")}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              disabled={saving}
            >
              <option value="PERSON">{strings.recipientPerson}</option>
              <option value="COMPANY">{strings.recipientCompany}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{strings.deliveryType}</label>
            <select
              value={deliveryType}
              onChange={(e) =>
                setDeliveryType(e.target.value as "WAREHOUSE" | "POSTOMAT" | "ADDRESS")
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              disabled={saving}
            >
              <option value="WAREHOUSE">{strings.warehouse}</option>
              <option value="POSTOMAT">{strings.postomat}</option>
              <option value="ADDRESS">{strings.address}</option>
            </select>
          </div>
          {recipientType === "PERSON" && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{strings.firstName}</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{strings.lastName}</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{strings.phone}</label>
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
            <label className="block text-xs font-medium text-zinc-600">{strings.cityFromDirectory}</label>
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
              placeholder={strings.cityPlaceholder}
            />
          </div>
          {(deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && (
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                {deliveryType === "POSTOMAT" ? strings.postomatFromDirectory : strings.warehouseFromDirectory}
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
                placeholder={strings.warehousePlaceholder}
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
              {strings.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? strings.saving : isEdit ? strings.submitEdit : strings.submitAdd}
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
  strings,
}: {
  isCreate: boolean;
  apiBaseUrl: string;
  contactId: string;
  contactPerson?: { firstName: string; lastName: string; phone: string };
  strings: DeliveryUiStrings;
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
    return <p className="text-sm text-zinc-500">{strings.saveFirst}</p>;
  }
  if (loading && profiles.length === 0) {
    return <p className="text-sm text-zinc-500">{strings.loading}</p>;
  }
  return (
    <>
      <EntitySection
        title={strings.sectionTitle}
        rightAction={
          <button
            type="button"
            onClick={() => {
              setEditingProfile(null);
              setAddModalOpen(true);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {strings.addProfile}
          </button>
        }
      >
        {profiles.length === 0 ? (
          <p className="text-sm text-zinc-500">{strings.noProfiles}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.label || strings.unnamed}</span>
                  {p.isDefault && (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{strings.defaultBadge}</span>
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
                    title={strings.editTitle}
                    aria-label={strings.editTitle}
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
                      if (!confirm(strings.deleteConfirm(p.label || strings.unnamed))) return;
                      apiHttp
                        .delete(`/contacts/${contactId}/shipping-profiles/${p.id}`)
                        .then(() => loadProfiles())
                        .catch(() => {});
                    }}
                    className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    title={strings.deleteTitle}
                    aria-label={strings.deleteTitle}
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
          strings={strings}
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
  strings,
}: {
  contactId: string;
  additionalPhones: ContactPhone[];
  onUpdated: () => void;
  saving: boolean;
  strings: ContactPhonesSectionStrings;
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
      setAddError(strings.enterPhone);
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
        (err instanceof Error ? err.message : strings.errorGeneric);
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
      <label className="text-sm text-zinc-500">{strings.additionalPhones}</label>
      <ul className="space-y-1 text-sm">
        {additionalPhones.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/50 px-2 py-1.5">
            <span>
              {formatPhoneDisplay(p.phone)}
              {p.label ? <span className="ml-1 text-zinc-500">({p.label})</span> : null}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                onClick={() => handleSetPrimary(p.id)}
                disabled={saving || mutatingId !== null}
              >
                {strings.setPrimary}
              </button>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
                onClick={() => handleDelete(p.id)}
                disabled={saving || mutatingId !== null}
              >
                {strings.remove}
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
          {strings.addNumber}
        </button>
      ) : (
        <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded border border-zinc-200 bg-white p-2">
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <input
            type="text"
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
            placeholder={strings.phonePlaceholder}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder={strings.labelPlaceholder}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" className="text-sm text-zinc-600 hover:underline" onClick={() => setAddOpen(false)}>
              {strings.cancel}
            </button>
            <button type="submit" className="text-sm text-blue-600 hover:underline" disabled={addSaving}>
              {addSaving ? strings.saving : strings.add}
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
  documentDisplayName?: string | null;
  region?: string | null;
  addressInfo?: string | null;
  city?: string | null;
  clientType?: string | null;
  status?: string | null;
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
  const contactCardV2 = useContactCardV2Effective();
  const modalStr = useMemo(() => getContactModalStrings(contactCardV2), [contactCardV2]);
  const aboutStr = useMemo(() => getContactAboutStrings(contactCardV2), [contactCardV2]);
  const phonesSectionStr = useMemo(() => getContactPhonesSectionStrings(contactCardV2), [contactCardV2]);
  const deliveryStr = useMemo(() => getDeliveryUiStrings(contactCardV2), [contactCardV2]);

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
  const [addressRequiredForVisit, setAddressRequiredForVisit] = useState(false);

  const addressBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const lastGeocodedAddressRef = useRef<string>("");
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [externalCode, setExternalCode] = useState("");
  const [documentDisplayName, setDocumentDisplayName] = useState("");
  const [region, setRegion] = useState("");
  const [addressInfo, setAddressInfo] = useState("");
  const [city, setCity] = useState("");
  const [clientType, setClientType] = useState("");
  const [status, setStatus] = useState("");

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
  /** Resolved store origin for set-password link (settings or NEXT_PUBLIC_STORE_PUBLIC_URL). */
  const [resetPasswordPublicStoreBase, setResetPasswordPublicStoreBase] = useState<string | null>(null);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const resetPasswordFullUrl = useMemo(() => {
    if (!resetPasswordResult || !resetPasswordPublicStoreBase) return null;
    return buildStoreThankYouSetPasswordUrl(
      resetPasswordPublicStoreBase,
      resetPasswordResult.setPasswordToken,
    );
  }, [resetPasswordResult, resetPasswordPublicStoreBase]);
  const isResetPasswordDialogOpen = resetPasswordResult !== null || resetPasswordError !== null;
  const closeResetPasswordDialog = useCallback(() => {
    setResetPasswordError(null);
    setResetPasswordResult(null);
    setResetPasswordPublicStoreBase(null);
  }, []);

  const [leftTab, setLeftTab] = useState<ContactLeftTabId>("main");
  const [changeHistory, setChangeHistory] = useState<ContactChangeHistoryItem[]>([]);
  const [loadingChangeHistory, setLoadingChangeHistory] = useState(false);
  const [changeHistoryError, setChangeHistoryError] = useState<string | null>(null);

  const cancelInlineEditRef = useRef<(() => void) | null>(null);

  const canClose = !saving;

  const title = useMemo(() => (isCreate ? modalStr.titleNew : modalStr.titleContact), [isCreate, modalStr]);

  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<Error | undefined>(undefined);

  const {
    data: cardSnapshot,
    loading: cardLoading,
    error: cardError,
    reload: reloadCard,
    clear: clearCard,
  } = useContactCard(contactId, contactCardV2 && !isCreate, modalStr.cardLoadError);

  const paymentOrderId = useMemo(() => {
    if (!cardSnapshot) return null;
    for (const items of [
      cardSnapshot.canonicalOrders.items,
      cardSnapshot.legacyLinkedOrders.items,
      cardSnapshot.companyOrders.items,
    ]) {
      const row = items.find((o) => Number(o.debtAmount) > 0);
      if (row) return row.id;
    }
    return null;
  }, [cardSnapshot]);

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
        setMapsConfigError(modalStr.mapsNoApiKey);
      } else {
        setMapsConfigError(null);
      }
    } catch {
      setMapsApiKey(null);
      setMapsConfigError(modalStr.mapsConfigLoadFailed);
    }
  }, [modalStr]);

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
      setOwnerId(data.ownerId != null ? String(data.ownerId) : null);
      setCompanyId(data.companyId != null ? String(data.companyId) : null);
      setExternalCode((data.externalCode ?? "") as string);
      setDocumentDisplayName((data.documentDisplayName ?? "") as string);
      setRegion((data.region ?? "") as string);
      setAddressInfo((data.addressInfo ?? "") as string);
      setCity((data.city ?? "") as string);
      setClientType((data.clientType ?? "") as string);
      setStatus((data.status ?? "") as string);
      await Promise.all([fetchCompanies(), fetchUsers()]);
      await reloadCard();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : modalStr.errLoadContactFallback);
      setContact(null);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [contactId, isCreate, fetchCompanies, fetchUsers, reloadCard, modalStr]);

  useEffect(() => {
    if (!contactCardV2 || isCreate || !contactId) return;
    clearCard();
  }, [contactId, isCreate, clearCard]);

  useEffect(() => {
    if (!contactCardV2 || isCreate || !contactId || ordersReloadKey === 0) return;
    void reloadCard();
  }, [ordersReloadKey, contactId, isCreate, reloadCard]);

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
    setLeftTab("main");
  }, [contactId]);

  const loadChangeHistory = useCallback(async () => {
    if (isCreate || !contactId) {
      setChangeHistory([]);
      setChangeHistoryError(null);
      return;
    }
    setLoadingChangeHistory(true);
    setChangeHistoryError(null);
    try {
      const items = await contactsApi.getChangeHistory(contactId);
      setChangeHistory(items);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : modalStr.errLoadContactFallback);
      setChangeHistory([]);
      setChangeHistoryError(msg);
    } finally {
      setLoadingChangeHistory(false);
    }
  }, [contactId, isCreate, modalStr.errLoadContactFallback]);

  useEffect(() => {
    if (leftTab === "change-history" && !isCreate) {
      void loadChangeHistory();
    }
  }, [leftTab, isCreate, loadChangeHistory]);

  useEffect(() => {
    setErr(null);
    setContact(null);
    setChangeHistory([]);
    setChangeHistoryError(null);
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
      setStatus("");
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
      documentDisplayName: string | null;
      region: string | null;
      addressInfo: string | null;
      city: string | null;
      clientType: string | null;
      status: string | null;
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
      if (payload.status !== undefined) setStatus(payload.status ?? "");
      if (payload.lat !== undefined) setLat(payload.lat ?? null);
      if (payload.lng !== undefined) setLng(payload.lng ?? null);
      if (payload.googlePlaceId !== undefined) setGooglePlaceId(payload.googlePlaceId ?? null);
      if (payload.ownerId !== undefined) setOwnerId(payload.ownerId != null ? String(payload.ownerId) : null);
      if (payload.companyId !== undefined) setCompanyId(payload.companyId != null ? String(payload.companyId) : null);
      if (payload.externalCode !== undefined) setExternalCode(payload.externalCode ?? "");
      if (payload.documentDisplayName !== undefined) setDocumentDisplayName(payload.documentDisplayName ?? "");
      onUpdate();
      if (contactCardV2 && !isCreate) {
        void reloadCard();
      }
      if (leftTab === "change-history" && !isCreate) {
        void loadChangeHistory();
      }
    },
    [contactCardV2, contactId, isCreate, leftTab, loadChangeHistory, onUpdate, reloadCard],
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

  useEffect(() => {
    if (lat != null && lng != null) setAddressRequiredForVisit(false);
  }, [lat, lng]);

  const handleSelectAddressSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!mapsApiKey) return;
      const userTypedBeforeSelect = address.trim();
      setAddress(suggestion.description);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressError(null);
      setIsGeocodeLoading(true);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setAddressError(modalStr.addressServiceUnavailable);
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(
          userTypedBeforeSelect,
          result.formattedAddress || suggestion.description,
        );
        setLat(result.lat);
        setLng(result.lng);
        setGooglePlaceId(result.placeId);
        setAddress(merged);
        setAddressStatus("google");
        if (!isCreate) {
          try {
            await patchContact({
              address: merged,
              lat: result.lat,
              lng: result.lng,
              googlePlaceId: result.placeId,
            });
          } catch {
            // keep local values
          }
        }
      } catch {
        setAddressError(modalStr.addressServiceUnavailable);
        console.warn("Places API (New): geocode place failed for", suggestion.placeId);
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [address, isCreate, mapsApiKey, patchContact, modalStr],
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
        const result = await geocodeText(mapsApiKey, query, { regionCode: "UA" });
        if (!result) {
          setAddressError(modalStr.addressServiceUnavailable);
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(query, result.formattedAddress || query);
        setLat(result.lat);
        setLng(result.lng);
        setGooglePlaceId(result.placeId);
        setAddress(merged);
        setAddressStatus("geocoded");
        lastGeocodedAddressRef.current = merged.trim();
        if (!isCreate) {
          try {
            await patchContact({
              address: merged,
              lat: result.lat,
              lng: result.lng,
              googlePlaceId: result.placeId,
            });
          } catch {
            // noop
          }
        }
      } catch {
        setAddressError(modalStr.addressServiceUnavailable);
        console.warn("Places API (New): geocode text failed for", query);
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [isCreate, mapsApiKey, patchContact, modalStr],
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
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions(suggestions);
        setAddressError(null);
      } catch (e) {
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions([]);
        setAddressError(modalStr.addressServiceUnavailable);
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
  }, [address, showAddressSuggestions, mapsApiKey, modalStr]);

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
    if (isResetPasswordDialogOpen) {
      closeResetPasswordDialog();
      return true;
    }
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
  }, [closeResetPasswordDialog, createOrderOpen, isResetPasswordDialogOpen, orderId]);

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
        status: status.trim() || null,
        address: address.trim() || null,
        lat,
        lng,
        googlePlaceId,
        ownerId: ownerId || null,
        companyId: companyId || null,
      };
      if (!payload.firstName) throw new Error(modalStr.errFirstNameRequired);
      if (!payload.lastName) throw new Error(modalStr.errLastNameRequired);
      if (!payload.phone) throw new Error(modalStr.errPhoneRequired);
      await apiHttp.post("/contacts", payload);
      onUpdate();
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : modalStr.errGenericAction);
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const scheduleVisit = async () => {
    if (!contact) {
      alert(modalStr.visitAlertSaveContactFirst);
      return;
    }
    const effectiveLat = lat ?? contact.lat ?? null;
    const effectiveLng = lng ?? contact.lng ?? null;
    if (effectiveLat == null || effectiveLng == null) {
      setAddressRequiredForVisit(true);
      setTimeout(() => {
        addressInputRef.current?.focus();
        addressInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    try {
      await visitsApi.create({
        contactId: contact.id,
        companyId: contact.companyId ?? undefined,
        title: `${contact.lastName} ${contact.firstName}`.trim() || modalStr.visitTitleDefault,
        phone: contact.phone ?? undefined,
        addressText: contact.address ?? undefined,
        lat: effectiveLat,
        lng: effectiveLng,
      });
      alert(modalStr.visitAlertSuccess);
    } catch (e) {
      const raw = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const fromApi = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
      const msg =
        fromApi ??
        (e instanceof Error && e.message.trim() ? e.message.trim() : modalStr.visitScheduleErrorFallback);
      alert(msg);
    }
  };

  const fullName = useMemo(() => {
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    return `${a} ${b}`.trim() || null;
  }, [contact]);

  const headerSubtitle = useMemo(() => {
    if (isCreate) return undefined;
    if (!contactCardV2 || !contact) return fullName ?? undefined;
    const bits: string[] = [];
    if (contact.status?.trim()) bits.push(contact.status.trim());
    if (contact.clientType?.trim()) bits.push(contact.clientType.trim());
    const geo = [contact.city, contact.region].filter(Boolean).join(", ");
    if (geo) bits.push(geo);
    return (
      <div className="max-w-xl space-y-1">
        <div className="text-sm font-semibold text-zinc-900">{fullName}</div>
        {bits.length > 0 ? <div className="text-xs text-zinc-600">{bits.join(" · ")}</div> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {contact.company?.name ? (
            onOpenCompany && contact.companyId ? (
              <button
                type="button"
                className="font-medium text-blue-700 hover:underline"
                onClick={() => onOpenCompany(contact.companyId!)}
              >
                {contact.company.name}
              </button>
            ) : (
              <span>{contact.company.name}</span>
            )
          ) : (
            <span className="text-zinc-400">{modalStr.metaNoCompany}</span>
          )}
          {contact.owner?.fullName ? (
            <span>
              {modalStr.metaManager}: {contact.owner.fullName}
            </span>
          ) : null}
        </div>
      </div>
    );
  }, [isCreate, contact, fullName, onOpenCompany, contactCardV2, modalStr]);

  const REGION_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "", label: "—" },
    { value: "Вінницька", label: "Вінницька" },
    { value: "Волинська", label: "Волинська" },
    { value: "Дніпропетровська", label: "Дніпропетровська" },
    { value: "Донецька", label: "Донецька" },
    { value: "Житомирська", label: "Житомирська" },
    { value: "Закарпатська", label: "Закарпатська" },
    { value: "Запорізька", label: "Запорізька" },
    { value: "Івано-Франківська", label: "Івано-Франківська" },
    { value: "Київська", label: "Київська" },
    { value: "Кіровоградська", label: "Кіровоградська" },
    { value: "Луганська", label: "Луганська" },
    { value: "Львівська", label: "Львівська" },
    { value: "Миколаївська", label: "Миколаївська" },
    { value: "Одеська", label: "Одеська" },
    { value: "Полтавська", label: "Полтавська" },
    { value: "Рівненська", label: "Рівненська" },
    { value: "Сумська", label: "Сумська" },
    { value: "Тернопільська", label: "Тернопільська" },
    { value: "Харківська", label: "Харківська" },
    { value: "Херсонська", label: "Херсонська" },
    { value: "Хмельницька", label: "Хмельницька" },
    { value: "Черкаська", label: "Черкаська" },
    { value: "Чернівецька", label: "Чернівецька" },
    { value: "Чернігівська", label: "Чернігівська" },
  ];

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: String(c.id), label: c.name })),
    [companies],
  );

  const companyOptionsWithEmpty = useMemo(
    () => [{ id: "", label: aboutStr.placeholderNoCompany }, ...companyOptions],
    [companyOptions, aboutStr.placeholderNoCompany],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: String(u.id), label: u.fullName || u.email })),
    [users],
  );

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelInlineEditRef.current = cancel;
  }, []);

  const aboutContactSection = useMemo(() => {
    const a = aboutStr;
    if (loading) {
      return <div className="text-sm text-zinc-500">{a.loading}</div>;
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
          <label className="block text-sm font-medium text-zinc-700">{a.createFirstName}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={a.placeholderJohn}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.createLastName}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={a.placeholderDoe}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.createPhone}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={a.placeholderPhone}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.createEmail}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={a.placeholderEmail}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.createPosition}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={a.placeholderManager}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.createExternalCode}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            placeholder={a.createExternalCodePh}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.fieldRegion}</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={saving}
          >
            {REGION_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.fieldAddressInfo}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={addressInfo}
            onChange={(e) => setAddressInfo(e.target.value)}
            placeholder={a.createAddressInfoPh}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.fieldCity}</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={a.createCityPh}
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.fieldClientType}</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={clientType}
            onChange={(e) => setClientType(e.target.value)}
            disabled={saving}
          >
            <option value="">{a.placeholderDash}</option>
            <option value="Врач">{a.clientTypeDoctor}</option>
            <option value="Техник">{a.clientTypeTech}</option>
          </select>
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.fieldStatus}</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={saving}
          >
            <option value="">{a.placeholderDash}</option>
            <option value="Клієнт">Клієнт</option>
            <option value="Зацікавленний">Зацікавленний</option>
            <option value="Тимчасово не працює">Тимчасово не працює</option>
            <option value="Відмова">Відмова</option>
            <option value="Немає зв'язку">Немає зв'язку</option>
            <option value="Видалити">Видалити</option>
            <option value="Не працює з імплантами">Не працює з імплантами</option>
          </select>
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.fieldAddress}</label>
          {addressRequiredForVisit ? (
            <p className="mt-1 text-sm text-red-600">{a.addressRequiredForVisit}</p>
          ) : null}
          <div className="mt-1 space-y-2">
            <div className="relative">
              <input
                ref={addressInputRef}
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-zinc-400 ${
                  addressRequiredForVisit ? "border-red-500 ring-1 ring-red-500" : "border-zinc-200"
                }`}
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
                placeholder={a.placeholderStreetCity}
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
              {isAddressLookupLoading && mapsApiKey ? a.searchingAddresses : null}
              {!isAddressLookupLoading && isGeocodeLoading ? a.searchingCoords : null}
              {!isAddressLookupLoading && addressStatus === "google" ? a.addressGoogle : null}
              {!isAddressLookupLoading && addressStatus === "geocoded" ? a.addressGeocoded : null}
              {!isAddressLookupLoading && addressStatus === "manual" ? a.addressManual : null}
              {!isAddressLookupLoading && addressError ? addressError : null}
              {!isAddressLookupLoading && !addressError && !mapsApiKey ? mapsConfigError : null}
              {!isAddressLookupLoading && !addressError && mapsApiKey && googleLoadError
                ? a.mapsScriptFailed
                : null}
            </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {lat != null && lng != null ? a.coordsSet : a.coordsUnset}
            </span>
            {mapsApiKey ? (
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:underline"
                onClick={toggleMap}
              >
                {isMapEnabled ? a.mapHide : a.mapShow}
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
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.responsibleManager}</label>
          <div className="mt-1">
            <SearchableSelectLite
              value={ownerId}
              options={userOptions}
              placeholder={a.placeholderNotAssigned}
              disabled={saving || loadingUsers}
              isLoading={loadingUsers}
              onChange={(id) => setOwnerId(id)}
            />
          </div>
          <label className="mt-3 block text-sm font-medium text-zinc-700">{a.company}</label>
          <div className="mt-1 flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelectLite
                value={companyId ?? ""}
                options={companyOptionsWithEmpty}
                placeholder={a.placeholderNoCompany}
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
                {a.openCompany}
              </button>
            ) : null}
            {onOpenCompany ? (
              <button
                type="button"
                onClick={() => onOpenCompany("new")}
                className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                {a.createCompany}
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
              {a.scheduleVisit}
            </button>
          </div>
        </>
      );
    }

    if (!contact) {
      return <div className="text-sm text-zinc-500">{a.notFound}</div>;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">{a.lastVisit}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-900">
              {contact.lastVisitAt
                ? new Date(contact.lastVisitAt).toLocaleString()
                : <span className="font-normal text-zinc-400">{a.noVisits}</span>}
            </span>
            <button
              type="button"
              onClick={() => void scheduleVisit()}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {a.scheduleVisit}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-2">
          {contact.telegramLinked ? (
            <>
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                {a.telegramConnected}
                {contact.telegramUsername ? ` @${contact.telegramUsername}` : ""}
              </span>
              {contact.telegramConversationId && (
                <a
                  href={`/inbox/telegram?conversationId=${contact.telegramConversationId}`}
                  className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {a.openTelegramChat}
                </a>
              )}
            </>
          ) : (
            <span className="text-xs text-zinc-500">{a.telegramNotLinked}</span>
          )}
        </div>
        <InlineEditableField
          label={a.fieldFirstName}
          value={contact.firstName}
          placeholder={a.placeholderClickAdd}
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
          label={a.fieldLastName}
          value={contact.lastName}
          placeholder={a.placeholderClickAdd}
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
          label={a.fieldPhonePrimary}
          value={formatPhoneDisplay(contact.phone ?? "")}
          placeholder={a.placeholderClickAdd}
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
            strings={phonesSectionStr}
          />
        )}
        <InlineEditableField
          label={a.fieldEmail}
          value={contact.email ?? ""}
          placeholder={a.placeholderClickAdd}
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ email: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldPosition}
          value={contact.position ?? ""}
          placeholder={a.placeholderClickAdd}
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ position: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldExternalCode}
          value={contact.externalCode ?? ""}
          placeholder={a.placeholderClickAdd}
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ externalCode: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldDocumentDisplayName}
          value={contact.documentDisplayName ?? ""}
          placeholder={a.placeholderDocumentName}
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ documentDisplayName: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldRegion}
          value={contact.region ?? ""}
          placeholder={a.placeholderDash}
          kind="select"
          options={REGION_OPTIONS}
          disabled={saving}
          onSave={async (next) => patchContact({ region: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldAddressInfo}
          value={contact.addressInfo ?? ""}
          placeholder={a.placeholderClickAdd}
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ addressInfo: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldCity}
          value={contact.city ?? ""}
          placeholder={a.placeholderClickAdd}
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ city: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldClientType}
          value={contact.clientType ?? ""}
          placeholder={a.placeholderDash}
          kind="select"
          options={[
            { value: "", label: a.placeholderDash },
            { value: "Врач", label: a.clientTypeDoctor },
            { value: "Техник", label: a.clientTypeTech },
          ]}
          disabled={saving}
          onSave={async (next) => patchContact({ clientType: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label={a.fieldStatus}
          value={contact.status ?? ""}
          placeholder={a.placeholderDash}
          kind="select"
          options={[
            { value: "", label: a.placeholderDash },
            { value: "Клієнт", label: "Клієнт" },
            { value: "Зацікавленний", label: "Зацікавленний" },
            { value: "Тимчасово не працює", label: "Тимчасово не працює" },
            { value: "Відмова", label: "Відмова" },
            { value: "Немає зв'язку", label: "Немає зв'язку" },
            { value: "Видалити", label: "Видалити" },
            { value: "Не працює з імплантами", label: "Не працює з імплантами" },
          ]}
          disabled={saving}
          onSave={async (next) => patchContact({ status: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <div className="space-y-1 py-1">
          <label className="text-sm text-zinc-500">{a.fieldAddress}</label>
          {addressRequiredForVisit ? (
            <p className="text-sm text-red-600">{a.addressRequiredForVisit}</p>
          ) : null}
          <div className="relative">
            <input
              ref={addressInputRef}
              className={`w-full rounded-md border px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 ${
                addressRequiredForVisit ? "border-red-500 ring-1 ring-red-500" : "border-zinc-200"
              }`}
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
              placeholder={a.placeholderClickAdd}
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
            {isAddressLookupLoading && mapsApiKey ? a.searchingAddresses : null}
            {!isAddressLookupLoading && isGeocodeLoading ? a.searchingCoords : null}
            {!isAddressLookupLoading && addressStatus === "google" ? a.addressGoogle : null}
            {!isAddressLookupLoading && addressStatus === "geocoded" ? a.addressGeocoded : null}
            {!isAddressLookupLoading && addressStatus === "manual" ? a.addressManual : null}
            {!isAddressLookupLoading && addressError ? addressError : null}
            {!isAddressLookupLoading && !addressError && !mapsApiKey ? mapsConfigError : null}
            {!isAddressLookupLoading && !addressError && mapsApiKey && googleLoadError
              ? a.mapsScriptFailed
              : null}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {lat != null && lng != null ? a.coordsSet : a.coordsUnset}
            </span>
            {mapsApiKey ? (
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:underline"
                onClick={toggleMap}
              >
                {isMapEnabled ? a.mapHide : a.mapShow}
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
          <span className="text-sm text-zinc-500">{a.responsibleManager}</span>
          <SearchableSelectLite
            variant="inline"
            value={ownerId}
            options={userOptions}
            placeholder={a.placeholderClickAdd}
            disabled={saving || loadingUsers}
            isLoading={loadingUsers}
            onChange={async (id) => {
              setOwnerId(id);
              await patchContact({ ownerId: id });
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">{a.company}</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <SearchableSelectLite
              variant="inline"
              value={companyId ?? ""}
              options={companyOptionsWithEmpty}
              placeholder={a.placeholderClickAdd}
              disabled={saving || loadingCompanies}
              isLoading={loadingCompanies}
              onChange={async (id) => {
                const next = id === "" ? null : id;
                setCompanyId(next);
                await patchContact({ companyId: next });
              }}
              onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
              createLabel={a.createCompany}
            />
            {onOpenCompany && companyId ? (
              <button
                type="button"
                onClick={() => onOpenCompany(companyId)}
                className="shrink-0 text-sm text-zinc-700 hover:underline"
              >
                {a.openCompany}
              </button>
            ) : null}
          </div>
        </div>
        <div className="pt-2 text-xs text-zinc-500">
          {a.created}: {new Date(contact.createdAt).toLocaleString()}
          <br />
          {a.updated}: {new Date(contact.updatedAt).toLocaleString()}
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
    addressRequiredForVisit,
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
    region,
    city,
    addressInfo,
    externalCode,
    clientType,
    status,
    ownerId,
    userOptions,
    loadingUsers,
  ]);

  const tabsUnderHeader = (
    <ContactCardTabsUnderHeader
      cardV2={contactCardV2}
      isCreate={isCreate}
      contact={contact}
      cardSnapshot={cardSnapshot}
      cardLoading={cardLoading}
      listLoading={loading}
      cardError={cardError}
      onCreateOrder={() => setCreateOrderOpen(true)}
      onScheduleVisit={() => void scheduleVisit()}
      onOpenTasksTab={() => setLeftTab("tasks")}
      onOpenPaymentOrder={(id) => setOrderId(id)}
      visitDisabled={saving}
      paymentOrderId={paymentOrderId}
      leftTab={leftTab}
      onTabChange={setLeftTab}
      labels={modalStr}
    />
  );

  const mobileBottomBar =
    contactCardV2 && !isCreate && contact ? (
      <ContactQuickActionsMobileBar
        phone={contact.phone}
        onCreateOrder={() => setCreateOrderOpen(true)}
        onScheduleVisit={() => void scheduleVisit()}
        onOpenTasks={() => setLeftTab("tasks")}
        onOpenPayment={paymentOrderId ? () => setOrderId(paymentOrderId) : undefined}
        visitDisabled={saving}
        labels={{
          quickCall: modalStr.quickCall,
          quickEmail: modalStr.quickEmail,
          quickTelegram: modalStr.quickTelegram,
          quickVisit: modalStr.quickVisit,
          quickOrderShort: modalStr.quickOrderShort,
          quickTask: modalStr.quickTask,
          quickPayment: modalStr.quickPayment,
          tooltipNoPhone: modalStr.tooltipNoPhone,
        }}
      />
    ) : null;

  const leftContent = (
    <div className="min-h-0 overflow-auto">
        {leftTab === "main" && (
          isCreate ? (
            <div className="min-h-0 overflow-auto">
              <EntitySection title={modalStr.sectionAbout}>
                {aboutContactSection}
              </EntitySection>
            </div>
          ) : (
            <ContactCardOverviewLayout
              aboutSection={aboutContactSection}
              apiBaseUrl={apiBaseUrl}
              contactId={contactId}
              sectionAboutTitle={modalStr.sectionAbout}
              sectionActivityTitle={modalStr.sectionActivity}
              openCompanyButton={
                contact?.companyId && onOpenCompany ? (
                  <button
                    type="button"
                    onClick={() => onOpenCompany(contact.companyId!)}
                    className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    {modalStr.openCompany}
                  </button>
                ) : null
              }
            />
          )
        )}

        {leftTab === "orders" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">{modalStr.ordersSaveFirst}</p>
            ) : (
              <EntitySection title={modalStr.sectionOrders}>
                <div className="min-h-0 overflow-auto">
                  {contactCardV2 ? (
                    <ContactOrdersSections
                      key={ordersReloadKey}
                      data={cardSnapshot}
                      loading={cardLoading || (loading && !cardSnapshot)}
                      onOpenOrder={(id) => setOrderId(id)}
                    />
                  ) : (
                    <EntityOrdersList
                      key={ordersReloadKey}
                      apiBaseUrl={apiBaseUrl}
                      query={`clientId=${contactId}&pageSize=50`}
                      onOpenOrder={(id) => setOrderId(id)}
                    />
                  )}
                </div>
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "tasks" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">{modalStr.tasksSaveFirst}</p>
            ) : (
              <EntitySection title={modalStr.sectionTasks}>
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
            strings={deliveryStr}
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
              <p className="text-sm text-zinc-500">{modalStr.historySaveFirst}</p>
            ) : (
              <EntitySection title={modalStr.sectionChangeHistory}>
                <ContactChangeHistory
                  items={changeHistory}
                  loading={loadingChangeHistory}
                  error={changeHistoryError}
                  emptyText={modalStr.noHistory}
                  v2={contactCardV2}
                />
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
        {modalStr.cancel}
      </button>
      <button
        type="button"
        onClick={() => void saveCreate()}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? modalStr.saving : modalStr.save}
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
        title={
          !isCreate && loading && !contact && !err ? (
            <ContactCardHeaderTitleSkeleton />
          ) : (
            title
          )
        }
        subtitle={
          !isCreate && loading && !contact && !err ? (
            <ContactCardHeaderSubtitleSkeleton />
          ) : (
            headerSubtitle
          )
        }
        headerActions={
          <>
            {!isCreate && (
              <>
                <button
                  type="button"
                  onClick={() => setCreateOrderOpen(true)}
                  className="hidden rounded-md bg-accent-gradient px-3 py-2 text-sm font-medium text-white shadow-sm sm:inline-flex"
                >
                  {modalStr.addOrder}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setResetPasswordError(null);
                    setResetPasswordResult(null);
                    setResetPasswordPublicStoreBase(null);
                    setResetPasswordLoading(true);
                    try {
                      const res = await apiHttp.post<{
                        tempPassword: string;
                        setPasswordToken: string;
                      }>(`/contacts/${contactId}/reset-store-password`);
                      let storeBase = "";
                      try {
                        const cfg = await apiHttp.get<{ publicStoreUrl?: string }>("/settings/store");
                        const u = cfg.data?.publicStoreUrl;
                        if (typeof u === "string") storeBase = u.trim().replace(/\/+$/, "");
                      } catch {
                        /* ignore */
                      }
                      if (!storeBase && typeof process.env.NEXT_PUBLIC_STORE_PUBLIC_URL === "string") {
                        storeBase = process.env.NEXT_PUBLIC_STORE_PUBLIC_URL.replace(/\/+$/, "");
                      }
                      setResetPasswordPublicStoreBase(storeBase || null);
                      setResetPasswordResult(res.data);
                      if (leftTab === "change-history" && !isCreate) {
                        void loadChangeHistory();
                      }
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : null;
                      setResetPasswordError(msg ?? modalStr.resetPasswordErrorGeneric);
                    } finally {
                      setResetPasswordLoading(false);
                    }
                  }}
                  disabled={resetPasswordLoading}
                  className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {resetPasswordLoading ? "…" : modalStr.resetStorePassword}
                </button>
              </>
            )}
          </>
        }
        mobileBottomBar={mobileBottomBar}
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
          onOpenOrder={(id) => setOrderId(id)}
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
          onOpenOrder={(id) => {
            setCreateOrderOpen(false);
            setOrderId(id);
          }}
        />
      ) : null}

      {isResetPasswordDialogOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={closeResetPasswordDialog}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg"
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900">{modalStr.resetPasswordTitle}</h3>
            {resetPasswordError ? (
              <>
                <p className="mt-2 text-sm text-red-600">{resetPasswordError}</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeResetPasswordDialog}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    {modalStr.resetPasswordClose}
                  </button>
                </div>
              </>
            ) : resetPasswordResult ? (
              <>
                <p className="mt-2 text-sm text-zinc-600">
                  {modalStr.resetPasswordIntro}
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="text-xs text-zinc-500">{modalStr.resetPasswordTempLabel}</span>
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
                        {modalStr.copy}
                      </button>
                    </div>
                  </div>
                  {resetPasswordFullUrl ? (
                    <div>
                      <span className="text-xs text-zinc-500">{modalStr.resetPasswordLinkLabel}</span>
                      <div className="mt-0.5 space-y-2">
                        <code className="block max-h-24 overflow-auto rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-mono break-all">
                          {resetPasswordFullUrl}
                        </code>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={resetPasswordFullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                          >
                            {modalStr.openInNewTab}
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(resetPasswordFullUrl);
                            }}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                          >
                            {modalStr.copyLink}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
                      {modalStr.resetPasswordAmberHint}
                    </p>
                  )}
                  <div>
                    <span className="text-xs text-zinc-500">
                      {resetPasswordPublicStoreBase ? modalStr.tokenDiagnosticLabel : modalStr.tokenLabel}
                    </span>
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
                        {modalStr.copy}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeResetPasswordDialog}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    {modalStr.resetPasswordClose}
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
