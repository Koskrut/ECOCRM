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
import {
  buildContactShippingProfilePayload,
  NpShippingProfileFormFields,
  validateNpShippingProfileForm,
  type NpShippingProfileFormValues,
} from "@/components/np/NpShippingProfileFormFields";
import { strings } from "@/locales";
import { apiHttp } from "../../lib/api/client";
import type { MeResponse } from "@/lib/api/resources/auth";
import { contactsApi } from "@/lib/api/resources/contacts";
import { formatPhoneDisplay, formatPhoneInputMask } from "@/lib/formatPhone";
import { ContactCreateForm, type ContactCreateFormValues } from "./ContactCreateForm";
import { CONTACT_REGION_OPTIONS } from "./contact-region-options";
import { useContactPhoneDuplicateCheck } from "./useContactPhoneDuplicateCheck";
import { formatDate, formatDateTime } from "@/lib/crmDatetime";
import { visitsApi } from "@/lib/api";
import { manualCallingApi } from "@/lib/api/resources/manual-calling";
import { ContactCardHeader } from "./card/ContactCardHeader";
import { ContactCardSkeleton } from "./card/ContactCardSkeleton";
import { ContactKpiStrip } from "./card/ContactKpiStrip";
import { formatContactClientStage } from "./contact-formatters";
import { useContactCardSummary } from "./card/useContactCardSummary";
import { useContactInsights } from "./card/useContactInsights";
import { ContactCrmHint } from "./card/ContactCrmHint";
import { ContactAnalyticsTab } from "./card/ContactAnalyticsTab";
import { CustomFieldsPanel } from "@/components/metadata/CustomFieldsPanel";
import { ContactCardLayoutPanel } from "@/components/metadata/ContactCardLayoutPanel";
import { ContactCardAuditPanel } from "@/components/metadata/ContactCardAuditPanel";
import {
  useContactCardAnalytics,
  type ContactCardAnalyticsRange,
  type ContactCardAnalyticsScope,
} from "./card/useContactCardAnalytics";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import {
  addressHasHouseNumber,
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

const NEXT_ACTION_OPTIONS = [
  { value: "", label: "Без дії" },
  { value: "CALL", label: "Дзвінок" },
  { value: "MESSAGE", label: "Повідомлення" },
  { value: "SEND_OFFER", label: "Надіслати пропозицію" },
  { value: "CONTROL_PAYMENT", label: "Контроль оплати" },
  { value: "MEETING", label: "Зустріч" },
  { value: "NO_ACTION", label: "Без дії" },
] as const;

const CLIENT_STAGE_OPTIONS = [
  { value: "", label: "Без ручної стадії" },
  { value: "NEW_LEAD", label: "Новий лід" },
  { value: "IN_PROGRESS", label: "В роботі" },
  { value: "WAITING_DECISION", label: "Очікує рішення" },
  { value: "ACTIVE_CLIENT", label: "Активний клієнт" },
  { value: "DORMANT_CLIENT", label: "Сплячий клієнт" },
  { value: "AT_RISK", label: "У зоні ризику" },
  { value: "PROBLEM_DEBT", label: "Проблемна заборгованість" },
  { value: "LOST_CLIENT", label: "Втрачений клієнт" },
] as const;

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ShippingProfile = {
  id: string;
  label?: string | null;
  isDefault?: boolean | null;
  deliveryType?: string | null;
  recipientType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  phone?: string | null;
  // COMPANY fields
  companyName?: string | null;
  edrpou?: string | null;
  contactPersonFirstName?: string | null;
  contactPersonLastName?: string | null;
  contactPersonMiddleName?: string | null;
  contactPersonPhone?: string | null;
  cityRef?: string | null;
  cityName?: string | null;
  warehouseRef?: string | null;
  warehouseNumber?: string | null;
  warehouseType?: string | null;
  // ADDRESS fields
  streetRef?: string | null;
  streetName?: string | null;
  building?: string | null;
  flat?: string | null;
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
  const [middleName, setMiddleName] = useState(initialData?.middleName ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? defaultPerson?.phone ?? "");

  // COMPANY fields
  const [companyName, setCompanyName] = useState(initialData?.companyName ?? "");
  const [edrpou, setEdrpou] = useState(initialData?.edrpou ?? "");
  const [contactPersonFirstName, setContactPersonFirstName] = useState(
    initialData?.contactPersonFirstName ?? "",
  );
  const [contactPersonLastName, setContactPersonLastName] = useState(
    initialData?.contactPersonLastName ?? "",
  );
  const [contactPersonMiddleName, setContactPersonMiddleName] = useState(
    initialData?.contactPersonMiddleName ?? "",
  );
  const [contactPersonPhone, setContactPersonPhone] = useState(initialData?.contactPersonPhone ?? "");

  const [cityRef, setCityRef] = useState(initialData?.cityRef ?? "");
  const [cityName, setCityName] = useState(initialData?.cityName ?? "");
  const [warehouseRef, setWarehouseRef] = useState(initialData?.warehouseRef ?? "");
  const [warehouseLabel, setWarehouseLabel] = useState(
    initialData?.warehouseNumber ? `${initialData.warehouseNumber} — ${initialData.cityName ?? ""}` : "",
  );
  const [warehouseNumber, setWarehouseNumber] = useState(initialData?.warehouseNumber ?? "");

  // ADDRESS fields
  const [streetRef, setStreetRef] = useState(initialData?.streetRef ?? "");
  const [streetName, setStreetName] = useState(initialData?.streetName ?? "");
  const [building, setBuilding] = useState(initialData?.building ?? "");
  const [flat, setFlat] = useState(initialData?.flat ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formValues: NpShippingProfileFormValues = {
    label,
    recipientType,
    deliveryType,

    lastName,
    firstName,
    middleName,
    phone,

    companyName,
    edrpou,
    contactPersonLastName,
    contactPersonFirstName,
    contactPersonMiddleName,
    contactPersonPhone,

    cityRef,
    cityName,

    warehouseRef,
    warehouseLabel,
    warehouseNumber,

    streetRef,
    streetName,
    building,
    flat,
  };

  const setFormPatch = (patch: Partial<NpShippingProfileFormValues>) => {
    if (patch.label !== undefined) setLabel(patch.label);
    if (patch.recipientType !== undefined) setRecipientType(patch.recipientType);
    if (patch.deliveryType !== undefined) setDeliveryType(patch.deliveryType);

    if (patch.firstName !== undefined) setFirstName(patch.firstName);
    if (patch.lastName !== undefined) setLastName(patch.lastName);
    if (patch.middleName !== undefined) setMiddleName(patch.middleName);
    if (patch.phone !== undefined) setPhone(patch.phone);

    if (patch.companyName !== undefined) setCompanyName(patch.companyName);
    if (patch.edrpou !== undefined) setEdrpou(patch.edrpou);
    if (patch.contactPersonFirstName !== undefined) setContactPersonFirstName(patch.contactPersonFirstName);
    if (patch.contactPersonLastName !== undefined) setContactPersonLastName(patch.contactPersonLastName);
    if (patch.contactPersonMiddleName !== undefined) setContactPersonMiddleName(patch.contactPersonMiddleName);
    if (patch.contactPersonPhone !== undefined) setContactPersonPhone(patch.contactPersonPhone);

    if (patch.cityRef !== undefined) setCityRef(patch.cityRef);
    if (patch.cityName !== undefined) setCityName(patch.cityName);

    if (patch.warehouseRef !== undefined) setWarehouseRef(patch.warehouseRef);
    if (patch.warehouseLabel !== undefined) setWarehouseLabel(patch.warehouseLabel);
    if (patch.warehouseNumber !== undefined) setWarehouseNumber(patch.warehouseNumber);

    if (patch.streetRef !== undefined) setStreetRef(patch.streetRef);
    if (patch.streetName !== undefined) setStreetName(patch.streetName);
    if (patch.building !== undefined) setBuilding(patch.building);
    if (patch.flat !== undefined) setFlat(patch.flat);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateNpShippingProfileForm(formValues, { requireLabel: true });
    if (err) return setError(err);
    const trimmedLabel = label.trim();
    setSaving(true);
    setError(null);
    try {
      const payload = buildContactShippingProfilePayload(
        { ...formValues, label: trimmedLabel },
        { requireLabel: true },
      );
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
        (e instanceof Error ? e.message : "Не вдалося створити профіль");
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
              {isEdit ? "Редагувати профіль доставки" : "Додати профіль доставки"}
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
          <NpShippingProfileFormFields
            disabled={saving}
            requireLabel
            values={formValues}
            onChange={setFormPatch}
          />
            </div>
          </div>
          <div className="shrink-0 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Збереження…" : isEdit ? "Зберегти" : "Додати профіль"}
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
    return <p className="text-sm text-zinc-500">Спочатку збережіть контакт, щоб переглянути профілі доставки.</p>;
  }
  if (loading && profiles.length === 0) {
    return <p className="text-sm text-zinc-500">Завантаження…</p>;
  }
  return (
    <>
      <EntitySection
        title="Профілі доставки"
        rightAction={
          <button
            type="button"
            onClick={() => {
              setEditingProfile(null);
              setAddModalOpen(true);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Додати профіль
          </button>
        }
      >
        {profiles.length === 0 ? (
          <p className="text-sm text-zinc-500">Профілі доставки поки відсутні.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.label || "Без назви"}</span>
                  {p.isDefault && (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs">За замовчуванням</span>
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
                    title="Редагувати"
                    aria-label="Редагувати профіль"
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
                      if (!confirm(`Видалити профіль "${p.label || "Без назви"}"?`)) return;
                      apiHttp
                        .delete(`/contacts/${contactId}/shipping-profiles/${p.id}`)
                        .then(() => loadProfiles())
                        .catch(() => {});
                    }}
                    className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    title="Видалити"
                    aria-label="Видалити профіль"
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
      setAddError("Введіть номер");
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
        (err instanceof Error ? err.message : "Помилка");
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
                Сделать основным
              </button>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
                onClick={() => handleDelete(p.id)}
                disabled={saving || mutatingId !== null}
              >
                Видалити
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
          + Додати номер
        </button>
      ) : (
        <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded border border-zinc-200 bg-white p-2">
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <input
            type="text"
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
            placeholder="Номер телефону"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Мітка (моб., робочий…)"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" className="text-sm text-zinc-600 hover:underline" onClick={() => setAddOpen(false)}>
              Скасувати
            </button>
            <button type="submit" className="text-sm text-blue-600 hover:underline" disabled={addSaving}>
              {addSaving ? "Збереження…" : "Додати"}
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
  nextActionType?: string | null;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
  clientStage?: string | null;
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

export type ContactCreateInitial = {
  companyId?: string | null;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

type Props = {
  apiBaseUrl: string;
  contactId: string; // "new" or uuid
  onClose: () => void;
  onUpdate: () => void;
  /** After create (or opening duplicate), sync parent URL/state to the real contact id. */
  onCreated?: (id: string) => void;
  initialCreate?: ContactCreateInitial;
  onOpenCompany?: (id: string) => void;
  /** Role from parent (/auth/me); used for manual calling queue button. */
  userRole?: string | null;
};

export function ContactModal({
  apiBaseUrl,
  contactId,
  onClose,
  onUpdate,
  onCreated,
  initialCreate,
  onOpenCompany,
  userRole: userRoleProp,
}: Props) {
  const [savedContactId, setSavedContactId] = useState<string | null>(null);
  const [justSavedBanner, setJustSavedBanner] = useState(false);
  const effectiveContactId = savedContactId ?? contactId;
  const isCreate = effectiveContactId === "new";
  const isCardV2Enabled = process.env.NEXT_PUBLIC_CONTACT_CARD_V2 !== "0";
  const effectiveRole = userRoleProp ?? null;

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
  const [nextActionType, setNextActionType] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [savingNextAction, setSavingNextAction] = useState(false);
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const [nextActionSuccess, setNextActionSuccess] = useState<string | null>(null);
  const [clientStage, setClientStage] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageSuccess, setStageSuccess] = useState<string | null>(null);

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [users, setUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [queueingDialer, setQueueingDialer] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    tempPassword: string;
    setPasswordToken: string;
  } | null>(null);
  /** Resolved store origin for set-password link (settings or NEXT_PUBLIC_STORE_PUBLIC_URL). */
  const [resetPasswordPublicStoreBase, setResetPasswordPublicStoreBase] = useState<string | null>(null);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [headerActionsOpen, setHeaderActionsOpen] = useState(false);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);

  const resetPasswordFullUrl = useMemo(() => {
    if (!resetPasswordResult || !resetPasswordPublicStoreBase) return null;
    return buildStoreThankYouSetPasswordUrl(
      resetPasswordPublicStoreBase,
      resetPasswordResult.setPasswordToken,
    );
  }, [resetPasswordResult, resetPasswordPublicStoreBase]);

  type LeftTabId =
    | "overview"
    | "analytics"
    | "timeline"
    | "orders"
    | "delivery-profiles"
    | "tasks"
    | "change-history";
  const [leftTab, setLeftTab] = useState<LeftTabId>("overview");

  const phoneDuplicate = useContactPhoneDuplicateCheck(phone, isCreate);

  const cardSummary = useContactCardSummary(effectiveContactId, !isCreate && isCardV2Enabled);
  const contactInsights = useContactInsights(effectiveContactId, !isCreate && leftTab === "overview");
  const [analyticsRange, setAnalyticsRange] = useState<ContactCardAnalyticsRange>("30d");
  const [analyticsScope, setAnalyticsScope] = useState<ContactCardAnalyticsScope>("contact");
  const cardAnalytics = useContactCardAnalytics(effectiveContactId, {
    range: analyticsRange,
    scope: analyticsScope,
    enabled: !isCreate && isCardV2Enabled && leftTab === "analytics",
  });
  useEffect(() => {
    if (!contact?.companyId && analyticsScope === "company") {
      setAnalyticsScope("contact");
    }
  }, [contact?.companyId, analyticsScope]);

  const cancelInlineEditRef = useRef<(() => void) | null>(null);

  const canClose = !saving;

  const title = useMemo(() => {
    if (isCreate) {
      const name = `${lastName.trim()} ${firstName.trim()}`.trim();
      return name || strings.contacts.create.title;
    }
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    return `${a} ${b}`.trim() || "Contact";
  }, [isCreate, firstName, lastName, contact?.firstName, contact?.lastName]);

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
    setSavedContactId(null);
    setJustSavedBanner(false);
  }, [contactId]);

  const refresh = useCallback(async (overrideId?: string) => {
    const targetId = overrideId ?? effectiveContactId;
    if (targetId === "new") return;
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<Contact>(`/contacts/${targetId}`);
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
      setNextActionType((data.nextActionType ?? "") as string);
      setNextActionAt(toDateTimeLocalValue(data.nextActionAt));
      setNextActionNote((data.nextActionNote ?? "") as string);
      setClientStage((data.clientStage ?? "") as string);
      setNextActionError(null);
      setNextActionSuccess(null);
      setStageError(null);
      setStageSuccess(null);
      await Promise.all([fetchCompanies(), fetchUsers()]);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося завантажити контакт");
      setContact(null);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [effectiveContactId, fetchCompanies, fetchUsers]);

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
    setLeftTab("overview");
    setIsMapEnabled(false);
    if (isCreate) {
      setLoading(false);
      setFirstName(initialCreate?.firstName ?? "");
      setLastName(initialCreate?.lastName ?? "");
      setPhone(
        initialCreate?.phone ? formatPhoneInputMask(initialCreate.phone) : "",
      );
      setEmail("");
      setPosition("");
      setAddress("");
      setLat(null);
      setLng(null);
      setGooglePlaceId(null);
      setAddressStatus(null);
      setOwnerId(null);
      void apiHttp
        .get<MeResponse>("/auth/me")
        .then((res) => {
          const uid = res.data?.user?.id;
          if (uid) setOwnerId(String(uid));
        })
        .catch(() => {});
      setCompanyId(initialCreate?.companyId ?? null);
      setExternalCode("");
      setRegion("");
      setAddressInfo("");
      setCity("");
      setClientType("");
      setStatus("");
      setNextActionType("");
      setNextActionAt("");
      setNextActionNote("");
      setClientStage("");
      setNextActionError(null);
      setNextActionSuccess(null);
      setStageError(null);
      setStageSuccess(null);
      void Promise.all([fetchCompanies(), fetchUsers()]);
      return;
    }
    void refresh();
  }, [isCreate, refresh, fetchCompanies, fetchUsers, initialCreate]);

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
      const res = await apiHttp.patch<Contact>(`/contacts/${effectiveContactId}`, payload);
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
      void cardSummary.refetch();
    },
    [cardSummary, effectiveContactId, onUpdate],
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
    const coordsAllowed = !nextAddress || addressHasHouseNumber(nextAddress);
    const nextLat = coordsAllowed ? (lat ?? null) : null;
    const nextLng = coordsAllowed ? (lng ?? null) : null;
    const nextPlaceId = coordsAllowed ? (googlePlaceId ?? null) : null;
    if (!coordsAllowed && nextAddress) {
      setAddressError(strings.common.houseNumberRequired);
    }
    const sameAddress = (contact.address ?? null) === nextAddress;
    const sameLat = (contact.lat ?? null) === nextLat;
    const sameLng = (contact.lng ?? null) === nextLng;
    const samePlaceId = (contact.googlePlaceId ?? null) === nextPlaceId;
    if (sameAddress && sameLat && sameLng && samePlaceId) return;
    if (!coordsAllowed) {
      setLat(null);
      setLng(null);
      setGooglePlaceId(null);
    }
    await patchContact({
      address: nextAddress,
      lat: nextLat,
      lng: nextLng,
      googlePlaceId: nextPlaceId,
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
          setAddressError("Сервіс адрес тимчасово недоступний.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(
          userTypedBeforeSelect,
          result.formattedAddress || suggestion.description,
        );
        setAddress(merged);
        if (!addressHasHouseNumber(merged)) {
          setLat(null);
          setLng(null);
          setGooglePlaceId(null);
          setAddressStatus(null);
          setAddressError(strings.common.houseNumberRequired);
          if (!isCreate) {
            try {
              await patchContact({
                address: merged,
                lat: null,
                lng: null,
                googlePlaceId: null,
              });
            } catch {
              // keep local values
            }
          }
          return;
        }
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
        setAddressError("Сервіс адрес тимчасово недоступний.");
        console.warn("Places API (New): geocode place failed for", suggestion.placeId);
      } finally {
        setIsGeocodeLoading(false);
      }
    },
    [address, isCreate, mapsApiKey, patchContact],
  );

  const geocodeFromAddressText = useCallback(
    async (rawAddress: string) => {
      const query = rawAddress.trim();
      if (!mapsApiKey || query.length < 3) return;
      if (lastGeocodedAddressRef.current === query) return;
      if (!addressHasHouseNumber(query)) {
        lastGeocodedAddressRef.current = "";
        setLat(null);
        setLng(null);
        setGooglePlaceId(null);
        setAddressStatus(null);
        setAddressError(strings.common.houseNumberRequired);
        if (!isCreate) {
          try {
            await patchContact({
              address: query,
              lat: null,
              lng: null,
              googlePlaceId: null,
            });
          } catch {
            // noop
          }
        }
        return;
      }
      lastGeocodedAddressRef.current = query;
      setAddressError(null);
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
          setLat(null);
          setLng(null);
          setGooglePlaceId(null);
          setAddress(merged);
          setAddressStatus(null);
          setAddressError(strings.common.houseNumberRequired);
          if (!isCreate) {
            try {
              await patchContact({
                address: merged,
                lat: null,
                lng: null,
                googlePlaceId: null,
              });
            } catch {
              // noop
            }
          }
          return;
        }
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
        setAddressError("Сервіс адрес тимчасово недоступний.");
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
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions(suggestions);
        setAddressError(null);
      } catch (e) {
        if (autocompleteAbortRef.current !== controller) return;
        setAddressSuggestions([]);
        setAddressError("Сервіс адрес тимчасово недоступний.");
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
    return false;
  }, [orderId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!headerActionsRef.current) return;
      const target = event.target as Node | null;
      if (target && headerActionsRef.current.contains(target)) return;
      setHeaderActionsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const saveCreate = async (opts?: { closeAfter?: boolean }) => {
    const closeAfter = opts?.closeAfter ?? false;
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
      const requiredMsg = (label: string) =>
        `${label} — ${strings.contacts.create.fieldRequired}`;
      if (!payload.firstName) throw new Error(requiredMsg(strings.contacts.create.firstName));
      if (!payload.lastName) throw new Error(requiredMsg(strings.contacts.create.lastName));
      if (!payload.phone) throw new Error(requiredMsg(strings.contacts.create.phone));
      if (!payload.region) throw new Error(requiredMsg(strings.contacts.create.region));
      const res = await apiHttp.post<Contact>("/contacts", payload);
      const id = res.data?.id;
      if (!id) throw new Error("Не вдалося створити контакт");
      setSavedContactId(id);
      onCreated?.(id);
      onUpdate();
      if (closeAfter) {
        onClose();
        return;
      }
      setJustSavedBanner(true);
      await refresh(id);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed");
      setErr(status === 409 ? strings.contacts.create.duplicateMessage : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFieldChange = useCallback(
    <K extends keyof ContactCreateFormValues>(key: K, value: ContactCreateFormValues[K]) => {
      switch (key) {
        case "firstName":
          setFirstName(value as string);
          break;
        case "lastName":
          setLastName(value as string);
          break;
        case "phone":
          setPhone(value as string);
          break;
        case "email":
          setEmail(value as string);
          break;
        case "position":
          setPosition(value as string);
          break;
        case "externalCode":
          setExternalCode(value as string);
          break;
        case "region":
          setRegion(value as string);
          break;
        case "addressInfo":
          setAddressInfo(value as string);
          break;
        case "city":
          setCity(value as string);
          break;
        case "clientType":
          setClientType(value as string);
          break;
        case "status":
          setStatus(value as string);
          break;
        case "companyId":
          setCompanyId(value as string | null);
          break;
        case "ownerId":
          setOwnerId(value as string | null);
          break;
        default:
          break;
      }
    },
    [],
  );

  const createFormValues: ContactCreateFormValues = useMemo(
    () => ({
      firstName,
      lastName,
      phone,
      email,
      position,
      externalCode,
      region,
      addressInfo,
      city,
      clientType,
      status,
      companyId,
      ownerId,
    }),
    [
      firstName,
      lastName,
      phone,
      email,
      position,
      externalCode,
      region,
      addressInfo,
      city,
      clientType,
      status,
      companyId,
      ownerId,
    ],
  );

  const createDirty = useMemo(() => {
    if (!isCreate) return false;
    return Boolean(
      firstName.trim() ||
        lastName.trim() ||
        phone.trim() ||
        email.trim() ||
        position.trim() ||
        externalCode.trim() ||
        region.trim() ||
        addressInfo.trim() ||
        city.trim() ||
        clientType.trim() ||
        status.trim() ||
        companyId ||
        ownerId,
    );
  }, [
    isCreate,
    firstName,
    lastName,
    phone,
    email,
    position,
    externalCode,
    region,
    addressInfo,
    city,
    clientType,
    status,
    companyId,
    ownerId,
  ]);

  const handleCloseCreate = useCallback(() => {
    if (createDirty && !window.confirm(strings.contacts.create.discardConfirm)) return;
    onClose();
  }, [createDirty, onClose]);

  const scheduleVisit = async () => {
    if (!contact) {
      alert("Сначала сохраните контакт и заполните адрес, чтобы запланировать встречу.");
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
        title: `${contact.lastName} ${contact.firstName}`.trim() || "Visit",
        phone: contact.phone ?? undefined,
        addressText: contact.address ?? undefined,
        lat: effectiveLat,
        lng: effectiveLng,
      });
      alert("Visit added to planned backlog.");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося запланувати візит");
      alert(msg);
    }
  };

  const openMainOrderModal = useCallback(async () => {
    if (isCreate || creatingOrder) return;
    setCreatingOrder(true);
    setErr(null);
    try {
      const payload = {
        clientId: effectiveContactId,
        contactId: effectiveContactId,
        companyId: contact?.companyId ?? null,
      };
      const res = await apiHttp.post<{ id: string; clientId?: string | null }>("/orders", payload);
      const createdId = res.data?.id;
      if (!createdId) throw new Error("Order id is missing in response");

      // Safety: ensure client/contact linkage is persisted before opening the main Order modal.
      if (res.data?.clientId !== effectiveContactId) {
        await apiHttp.patch(`/orders/${createdId}`, {
          clientId: effectiveContactId,
          contactId: effectiveContactId,
          ...(contact?.companyId ? { companyId: contact.companyId } : {}),
        });
      }

      setOrderId(createdId);
      setOrdersReloadKey((k) => k + 1);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося створити замовлення");
      setErr(msg);
    } finally {
      setCreatingOrder(false);
    }
  }, [contact?.companyId, effectiveContactId, creatingOrder, isCreate]);

  const enqueueDialer = useCallback(async () => {
    setQueueingDialer(true);
    setErr(null);
    try {
      await manualCallingApi.enqueue({ contactId: effectiveContactId });
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося додати в чергу");
      setErr(msg);
    } finally {
      setQueueingDialer(false);
    }
  }, [effectiveContactId]);

  const resetStorePassword = useCallback(async () => {
    setResetPasswordError(null);
    setResetPasswordResult(null);
    setResetPasswordPublicStoreBase(null);
    setResetPasswordLoading(true);
    try {
      const res = await apiHttp.post<{
        tempPassword: string;
        setPasswordToken: string;
      }>(`/contacts/${effectiveContactId}/reset-store-password`);
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : null;
      setResetPasswordError(msg ?? "У контакта нет аккаунта в магазине или произошла ошибка.");
    } finally {
      setResetPasswordLoading(false);
    }
  }, [effectiveContactId]);

  const saveNextAction = useCallback(async () => {
    if (isCreate || !contact) return;
    setSavingNextAction(true);
    setNextActionError(null);
    setNextActionSuccess(null);
    try {
      const normalizedType = nextActionType.trim() || null;
      const payload = {
        nextActionType: normalizedType as
          | "CALL"
          | "MESSAGE"
          | "SEND_OFFER"
          | "CONTROL_PAYMENT"
          | "MEETING"
          | "NO_ACTION"
          | null,
        nextActionAt:
          normalizedType && normalizedType !== "NO_ACTION" && nextActionAt.trim()
            ? new Date(nextActionAt).toISOString()
            : null,
        nextActionNote:
          normalizedType && normalizedType !== "NO_ACTION" ? nextActionNote.trim() || null : null,
      };
      const updated = await contactsApi.updateNextAction(contact.id, payload);
      setContact((prev) => (prev ? { ...prev, ...updated } : (updated as Contact)));
      setNextActionType((updated.nextActionType ?? "") as string);
      setNextActionAt(toDateTimeLocalValue(updated.nextActionAt));
      setNextActionNote((updated.nextActionNote ?? "") as string);
      setNextActionSuccess("Наступну дію збережено.");
      await contactInsights.refetch();
      onUpdate();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося зберегти наступну дію");
      setNextActionError(msg);
    } finally {
      setSavingNextAction(false);
    }
  }, [
    contact,
    contactInsights,
    isCreate,
    nextActionAt,
    nextActionNote,
    nextActionType,
    onUpdate,
  ]);

  const saveClientStage = useCallback(async () => {
    if (isCreate || !contact) return;
    setSavingStage(true);
    setStageError(null);
    setStageSuccess(null);
    try {
      const updated = await contactsApi.updateStage(contact.id, {
        clientStage: (clientStage.trim() || null) as
          | "NEW_LEAD"
          | "IN_PROGRESS"
          | "WAITING_DECISION"
          | "ACTIVE_CLIENT"
          | "DORMANT_CLIENT"
          | "AT_RISK"
          | "PROBLEM_DEBT"
          | "LOST_CLIENT"
          | null,
      });
      setContact((prev) => (prev ? { ...prev, ...updated } : (updated as Contact)));
      setClientStage((updated.clientStage ?? "") as string);
      setStageSuccess("Стадію клієнта збережено.");
      onUpdate();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося зберегти стадію клієнта");
      setStageError(msg);
    } finally {
      setSavingStage(false);
    }
  }, [clientStage, contact, isCreate, onUpdate]);

  const fullName = useMemo(() => {
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    return `${a} ${b}`.trim() || null;
  }, [contact]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: String(c.id), label: c.name })),
    [companies],
  );

  const companyOptionsWithEmpty = useMemo(
    () => [{ id: "", label: "— No company" }, ...companyOptions],
    [companyOptions],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: String(u.id), label: u.fullName || u.email })),
    [users],
  );

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelInlineEditRef.current = cancel;
  }, []);

  const aboutContactSection = useMemo(() => {
    if (loading) {
      return <div className="text-sm text-zinc-500">Завантаження…</div>;
    }
    if (err) {
      return (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      );
    }

    if (!contact) {
      return <div className="text-sm text-zinc-500">Не знайдено</div>;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Останній візит</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-900">
              {contact.lastVisitAt
                ? formatDateTime(contact.lastVisitAt)
                : <span className="font-normal text-zinc-400">Немає візитів</span>}
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
            <span className="text-xs text-zinc-500">Telegram не підключено</span>
          )}
        </div>
        <InlineEditableField
          label="First name"
          value={contact.firstName}
          placeholder="Натисніть, щоб додати…"
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
          placeholder="Натисніть, щоб додати…"
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
          value={formatPhoneDisplay(contact.phone ?? "")}
          placeholder="Натисніть, щоб додати…"
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
          placeholder="Натисніть, щоб додати…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ email: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Position"
          value={contact.position ?? ""}
          placeholder="Натисніть, щоб додати…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ position: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="КОД 1С"
          value={contact.externalCode ?? ""}
          placeholder="Натисніть, щоб додати…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ externalCode: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Як виводити на документ"
          value={contact.documentDisplayName ?? ""}
          placeholder="Напр. ФОП Петров Петр"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ documentDisplayName: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Область"
          value={contact.region ?? ""}
          placeholder="—"
          kind="select"
          options={CONTACT_REGION_OPTIONS}
          disabled={saving}
          onSave={async (next) => patchContact({ region: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Адрес (инфо)"
          value={contact.addressInfo ?? ""}
          placeholder="Натисніть, щоб додати…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ addressInfo: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Город"
          value={contact.city ?? ""}
          placeholder="Натисніть, щоб додати…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ city: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Тип клиента"
          value={contact.clientType ?? ""}
          placeholder="—"
          kind="select"
          options={[
            { value: "", label: "—" },
            { value: "Врач", label: "Врач" },
            { value: "Техник", label: "Техник" },
          ]}
          disabled={saving}
          onSave={async (next) => patchContact({ clientType: next?.trim() || null })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Статус"
          value={contact.status ?? ""}
          placeholder="—"
          kind="select"
          options={[
            { value: "", label: "—" },
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
          <label className="text-sm text-zinc-500">Адреса</label>
          {addressRequiredForVisit ? (
            <p className="text-sm text-red-600">Заполните адрес для планирования встреч</p>
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
              placeholder="Натисніть, щоб додати…"
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
          <span className="text-sm text-zinc-500">Відповідальний менеджер</span>
          <SearchableSelectLite
            variant="inline"
            value={ownerId}
            options={userOptions}
            placeholder="Натисніть, щоб додати…"
            disabled={saving || loadingUsers}
            isLoading={loadingUsers}
            onChange={async (id) => {
              setOwnerId(id);
              await patchContact({ ownerId: id });
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Компанія</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <SearchableSelectLite
              variant="inline"
              value={companyId ?? ""}
              options={companyOptionsWithEmpty}
              placeholder="Натисніть, щоб додати…"
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
          Created: {formatDateTime(contact.createdAt)}
          <br />
          Updated: {formatDateTime(contact.updatedAt)}
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
    nextActionType,
    nextActionAt,
    nextActionNote,
    nextActionError,
    nextActionSuccess,
    savingNextAction,
    saveNextAction,
    clientStage,
    stageError,
    stageSuccess,
    savingStage,
    saveClientStage,
    contactInsights.loading,
    contactInsights.error,
    contactInsights.data,
  ]);

  const tabsUnderHeader = (
    <div className="flex gap-1 overflow-x-auto py-2 whitespace-nowrap">
      {(
        ["overview", "analytics", "timeline", "orders", "delivery-profiles", "tasks", "change-history"] as const
      ).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setLeftTab(tab)}
          className={`shrink-0 rounded px-2 py-1.5 text-sm font-medium ${
            leftTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {tab === "overview"
            ? "Огляд"
            : tab === "analytics"
              ? "Аналітика"
            : tab === "timeline"
              ? "Таймлайн"
            : tab === "orders"
              ? "Замовлення"
              : tab === "delivery-profiles"
                ? "Профілі доставки"
                : tab === "tasks"
                  ? "Завдання"
                  : "Історія змін"}
        </button>
      ))}
    </div>
  );

  const leftContent = (
    <div className="min-h-0 overflow-auto">
        {leftTab === "overview" && (
          isCreate ? (
            <div className="min-h-0 overflow-auto space-y-3">
              {err ? (
                <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {err}
                </div>
              ) : null}
              <ContactCreateForm
                values={createFormValues}
                saving={saving}
                companyOptions={companyOptions}
                userOptions={userOptions}
                loadingCompanies={loadingCompanies}
                loadingUsers={loadingUsers}
                duplicate={phoneDuplicate}
                onChange={handleCreateFieldChange}
                onOpenCompany={onOpenCompany}
                onOpenExistingContact={(id) => onCreated?.(id)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {justSavedBanner ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {strings.contacts.create.saved}
                </div>
              ) : null}
              {isCardV2Enabled ? (
                cardSummary.loading ? (
                  <ContactCardSkeleton />
                ) : cardSummary.error ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Не вдалося завантажити summary. Показано legacy режим картки.
                  </div>
                ) : cardSummary.data ? (
                  <>
                    <ContactCardHeader
                      summary={cardSummary.data}
                    />
                    <ContactKpiStrip
                      kpi={cardSummary.data.kpi}
                      scopeNote={cardSummary.data.insights.scopeNote}
                    />
                    {cardSummary.data.insights.nextStep ? (
                      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Next step
                        </div>
                        <div className="mt-1 text-zinc-800">
                          {`${cardSummary.data.insights.nextStep.title}${
                            cardSummary.data.insights.nextStep.dueAt
                              ? ` · ${formatDate(cardSummary.data.insights.nextStep.dueAt)}`
                              : ""
                          }`}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null
              ) : null}
              <ContactCrmHint
                loading={contactInsights.loading}
                error={contactInsights.error}
                insights={contactInsights.data}
              />
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Стадія клієнта
                  </div>
                  {stageSuccess ? (
                    <span className="text-xs text-emerald-700">{stageSuccess}</span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm text-zinc-800">
                  Рекомендована стадія:{" "}
                  <span className="font-medium">
                    {formatContactClientStage(contactInsights.data?.suggestion.suggestedStage)}
                  </span>
                </div>
                <label className="mt-3 block text-sm text-zinc-700">
                  <span className="mb-1 block text-xs text-zinc-500">Стадія клієнта</span>
                  <select
                    value={clientStage}
                    onChange={(e) => {
                      setClientStage(e.target.value);
                      setStageSuccess(null);
                    }}
                    disabled={savingStage}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    {CLIENT_STAGE_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {stageError ? (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    {stageError}
                  </div>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveClientStage()}
                    disabled={savingStage}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {savingStage ? "Збереження..." : "Зберегти стадію"}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Наступна дія
                  </div>
                  {nextActionSuccess ? (
                    <span className="text-xs text-emerald-700">{nextActionSuccess}</span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-zinc-700">
                    <span className="mb-1 block text-xs text-zinc-500">Дія</span>
                    <select
                      value={nextActionType}
                      onChange={(e) => {
                        setNextActionType(e.target.value);
                        setNextActionSuccess(null);
                      }}
                      disabled={savingNextAction}
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    >
                      {NEXT_ACTION_OPTIONS.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-zinc-700">
                    <span className="mb-1 block text-xs text-zinc-500">Коли</span>
                    <input
                      type="datetime-local"
                      value={nextActionAt}
                      onChange={(e) => {
                        setNextActionAt(e.target.value);
                        setNextActionSuccess(null);
                      }}
                      disabled={savingNextAction || !nextActionType || nextActionType === "NO_ACTION"}
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50"
                    />
                  </label>
                </div>
                <label className="mt-3 block text-sm text-zinc-700">
                  <span className="mb-1 block text-xs text-zinc-500">Нотатка</span>
                  <textarea
                    rows={2}
                    value={nextActionNote}
                    onChange={(e) => {
                      setNextActionNote(e.target.value);
                      setNextActionSuccess(null);
                    }}
                    disabled={savingNextAction || !nextActionType || nextActionType === "NO_ACTION"}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50"
                    placeholder="Необов'язкова нотатка для фоллоуапу"
                  />
                </label>
                {nextActionError ? (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    {nextActionError}
                  </div>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveNextAction()}
                    disabled={savingNextAction}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {savingNextAction ? "Збереження..." : "Зберегти дію"}
                  </button>
                </div>
              </div>
              <div className="min-h-0 overflow-auto">
                <EntitySection
                  title={isCardV2Enabled ? "Overview" : "About contact"}
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
              <EntitySection title={strings.entityUi.contactCustomFieldsSection}>
                <CustomFieldsPanel entityType="CONTACT" entityId={effectiveContactId} />
              </EntitySection>
              <EntitySection title="Розмітка (runtime)">
                <ContactCardLayoutPanel contactId={effectiveContactId} />
              </EntitySection>
              <EntitySection title="Аудит">
                <ContactCardAuditPanel contactId={effectiveContactId} />
              </EntitySection>
            </div>
          )
        )}

        {leftTab === "timeline" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Спочатку збережіть контакт, щоб переглянути таймлайн.</p>
            ) : (
              <EntitySection title="Таймлайн">
                <ContactTimeline
                  apiBaseUrl={apiBaseUrl}
                  contactId={effectiveContactId}
                  showActivityButtons
                />
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "analytics" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Спочатку збережіть контакт, щоб переглянути аналітику.</p>
            ) : (
              <EntitySection title="Аналітика">
                <ContactAnalyticsTab
                  analytics={cardAnalytics.data}
                  loading={cardAnalytics.loading}
                  error={cardAnalytics.error}
                  range={analyticsRange}
                  scope={analyticsScope}
                  onRangeChange={setAnalyticsRange}
                  onScopeChange={setAnalyticsScope}
                  canUseCompanyScope={Boolean(contact?.companyId)}
                />
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "orders" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Спочатку збережіть контакт, щоб переглянути замовлення.</p>
            ) : (
              <EntitySection title="Замовлення">
                <div className="min-h-0 overflow-auto">
                  <EntityOrdersList
                    key={ordersReloadKey}
                    apiBaseUrl={apiBaseUrl}
                    query={`clientId=${effectiveContactId}&pageSize=50`}
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
              <p className="text-sm text-zinc-500">Спочатку збережіть контакт, щоб керувати завданнями.</p>
            ) : (
              <EntitySection title="Завдання">
                <EntityTasksList contactId={effectiveContactId} />
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "delivery-profiles" && (
          <ContactDeliveryProfilesTab
            isCreate={isCreate}
            apiBaseUrl={apiBaseUrl}
            contactId={effectiveContactId}
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
              <p className="text-sm text-zinc-500">Спочатку збережіть контакт, щоб переглянути історію змін.</p>
            ) : (
              <EntitySection title="Історія змін">
                <p className="text-sm text-zinc-500">Історія змін поки відсутня.</p>
              </EntitySection>
            )}
          </>
        )}
    </div>
  );

  const footer = isCreate ? (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={handleCloseCreate}
        disabled={saving}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {strings.common.cancel}
      </button>
      <button
        type="button"
        onClick={() => void saveCreate({ closeAfter: true })}
        disabled={saving}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {saving ? strings.contacts.create.saving : strings.contacts.create.saveAndClose}
      </button>
      <button
        type="button"
        onClick={() => void saveCreate({ closeAfter: false })}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? strings.contacts.create.saving : strings.common.save}
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
          <div className="flex items-center gap-2" ref={headerActionsRef}>
            {!isCreate ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHeaderActionsOpen((v) => !v)}
                  className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Действия
                </button>
                {headerActionsOpen ? (
                  <div className="absolute left-0 z-20 mt-1 min-w-56 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderActionsOpen(false);
                        void openMainOrderModal();
                      }}
                      disabled={creatingOrder}
                      className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {creatingOrder ? "Создаем заказ..." : "Создать заказ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderActionsOpen(false);
                        setLeftTab("tasks");
                      }}
                      className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      Создать задачу
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderActionsOpen(false);
                        void scheduleVisit();
                      }}
                      className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      Запланировать визит
                    </button>
                    <a
                      href={contact?.phone ? `tel:${contact.phone}` : undefined}
                      className={`block rounded px-2 py-2 text-sm ${
                        contact?.phone
                          ? "text-zinc-700 hover:bg-zinc-50"
                          : "pointer-events-none text-zinc-400"
                      }`}
                    >
                      Позвонить
                    </a>
                    <a
                      href={contact?.email ? `mailto:${contact.email}` : undefined}
                      className={`block rounded px-2 py-2 text-sm ${
                        contact?.email
                          ? "text-zinc-700 hover:bg-zinc-50"
                          : "pointer-events-none text-zinc-400"
                      }`}
                    >
                      Email
                    </a>
                    <a
                      href={
                        contact?.telegramConversationId
                          ? `/inbox/telegram?conversationId=${contact.telegramConversationId}`
                          : undefined
                      }
                      className={`block rounded px-2 py-2 text-sm ${
                        contact?.telegramConversationId
                          ? "text-zinc-700 hover:bg-zinc-50"
                          : "pointer-events-none text-zinc-400"
                      }`}
                    >
                      Сообщение
                    </a>
                    {(effectiveRole === "MANAGER" ||
                      effectiveRole === "ADMIN" ||
                      effectiveRole === "LEAD") && (
                      <button
                        type="button"
                        disabled={queueingDialer}
                        onClick={() => {
                          setHeaderActionsOpen(false);
                          void enqueueDialer();
                        }}
                        className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {queueingDialer ? "Добавляем в очередь..." : "В очередь прозвона"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={resetPasswordLoading}
                      onClick={() => {
                        setHeaderActionsOpen(false);
                        void resetStorePassword();
                      }}
                      className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {resetPasswordLoading ? "Сбрасываем..." : "Сбросить пароль"}
                    </button>
                    {effectiveRole === "ADMIN" ? (
                      <>
                        <div className="my-1 h-px bg-zinc-100" />
                        <button
                          type="button"
                          onClick={async () => {
                            setHeaderActionsOpen(false);
                            if (!contact) return;
                            if (!confirm(`Видалити контакт "${fullName ?? contact.id}"?`)) return;
                            try {
                              await contactsApi.delete(contact.id);
                              onUpdate();
                              onClose();
                            } catch (e) {
                              const msg =
                                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                                (e instanceof Error ? e.message : "Не вдалося видалити контакт");
                              alert(msg);
                            }
                          }}
                          className="block w-full rounded px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                        >
                          Видалити контакт
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        subtitle={undefined}
        headerActions={
          null
        }
        tabsUnderHeader={isCreate ? undefined : tabsUnderHeader}
        size={isCreate ? "compact" : "default"}
        left={leftContent}
        right={null}
        footer={footer}
        canClose={canClose}
        onClose={isCreate ? handleCloseCreate : onClose}
        onEscape={handleEscape}
      />

      {orderId ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          prefill={{
            clientId: effectiveContactId,
            companyId: contact?.companyId ?? null,
          }}
          onClose={() => setOrderId(null)}
          onSaved={() => {
            setOrdersReloadKey((k) => k + 1);
            void cardSummary.refetch();
          }}
          onOpenOrder={(id) => setOrderId(id)}
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
                      setResetPasswordPublicStoreBase(null);
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
                  Тимчасовий пароль і посилання для встановлення свого пароля (діє 24 год):
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="text-xs text-zinc-500">Тимчасовий пароль:</span>
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
                        Копіювати
                      </button>
                    </div>
                  </div>
                  {resetPasswordFullUrl ? (
                    <div>
                      <span className="text-xs text-zinc-500">Посилання для встановлення пароля:</span>
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
                            Відкрити в новій вкладці
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(resetPasswordFullUrl);
                            }}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                          >
                            Копіювати посилання
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
                      Щоб отримати готове посилання, вкажіть «Публічна URL вітрини» в{" "}
                      <span className="font-medium">Налаштування → Інтернет-магазин</span> або задайте змінну{" "}
                      <span className="font-mono">NEXT_PUBLIC_STORE_PUBLIC_URL</span> при збірці CRM. Нижче — токен для
                      ручної збірки URL.
                    </p>
                  )}
                  <div>
                    <span className="text-xs text-zinc-500">
                      {resetPasswordPublicStoreBase ? "Токен (для діагностики):" : "Токен:"}
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
                        Копіювати
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
                      setResetPasswordPublicStoreBase(null);
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
