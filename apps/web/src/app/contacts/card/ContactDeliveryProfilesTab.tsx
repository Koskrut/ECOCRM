"use client";

import { useCallback, useEffect, useState } from "react";
import { EntitySection } from "@/components/sections/EntitySection";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import {
  buildContactShippingProfilePayload,
  NpShippingProfileFormFields,
  validateNpShippingProfileForm,
  type NpShippingProfileFormValues,
} from "@/components/np/NpShippingProfileFormFields";
import { apiHttp } from "@/lib/api/client";

export type ShippingProfile = {
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

  const requestClose = () => scheduleModalClose(onClose);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 py-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
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
              onClick={requestClose}
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

export function ContactDeliveryProfilesTab({
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
