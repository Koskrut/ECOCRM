"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { AddressSuggestionsDropdown } from "@/components/inputs/AddressSuggestionsDropdown";
import {
  addressHasHouseNumber,
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  mergeFormattedAddressWithUserDetail,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";
import { resolveCityFromGoogleAddress } from "@/lib/contact-address.util";
import { entityAddressesApi, type EntityAddress } from "@/lib/api/resources/entity-addresses";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";

type Props = {
  entityType: "contact" | "company";
  entityId: string;
  disabled?: boolean;
  onUpdated?: () => void;
  /** Highlight addresses missing coords (e.g. when planning a visit). */
  highlightMissingCoords?: boolean;
};

type FormState = {
  label: string;
  city: string;
  addressText: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
};

const emptyForm = (): FormState => ({
  label: "",
  city: "",
  addressText: "",
  lat: null,
  lng: null,
  googlePlaceId: null,
});

function formFromAddress(a: EntityAddress): FormState {
  return {
    label: a.label ?? "",
    city: a.city ?? "",
    addressText: a.addressText,
    lat: a.lat,
    lng: a.lng,
    googlePlaceId: a.googlePlaceId,
  };
}

export function EntityAddressesSection({
  entityType,
  entityId,
  disabled = false,
  onUpdated,
  highlightMissingCoords = false,
}: Props) {
  const [items, setItems] = useState<EntityAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [addressHint, setAddressHint] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const googleQueryRef = useRef("");

  const { isLoaded: isGoogleLoaded } = useLoadScript({
    googleMapsApiKey: mapsApiKey ?? "",
    preventGoogleFontsLoading: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await entityAddressesApi.list(entityType, entityId);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити адреси");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    apiHttp
      .get<{ mapsApiKey?: string | null }>("/settings/google-maps/public")
      .then((res) => setMapsApiKey(res.data?.mapsApiKey ?? null))
      .catch(() => setMapsApiKey(null));
  }, []);

  useEffect(() => {
    if (!showSuggestions || !mapsApiKey) {
      setSuggestions([]);
      return;
    }
    const query = googleQueryRef.current.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    setLookupLoading(true);
    const t = setTimeout(() => {
      void autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" })
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setLookupLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [showSuggestions, mapsApiKey, form.addressText]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
    setMapOpen(false);
    setAddressHint(null);
  };

  const openEdit = (row: EntityAddress) => {
    setEditingId(row.id);
    setForm(formFromAddress(row));
    setFormOpen(true);
    setMapOpen(false);
    setAddressHint(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setMapOpen(false);
    setShowSuggestions(false);
    setAddressHint(null);
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    if (!mapsApiKey) return;
    setShowSuggestions(false);
    setLookupLoading(true);
    try {
      const result = await geocodePlace(mapsApiKey, suggestion.placeId);
      if (!result) return;
      const merged = mergeFormattedAddressWithUserDetail(
        googleQueryRef.current,
        result.formattedAddress || suggestion.description,
      );
      setForm((prev) => ({
        ...prev,
        addressText: merged,
        city: prev.city.trim() || result.city || resolveCityFromGoogleAddress(merged) || prev.city,
        lat: result.lat,
        lng: result.lng,
        googlePlaceId: suggestion.placeId,
      }));
      setMapOpen(true);
      setAddressHint(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const geocodeManual = async () => {
    if (!mapsApiKey) return;
    const query = form.addressText.trim();
    if (query.length < 3 || !addressHasHouseNumber(query)) {
      setAddressHint(strings.common.houseNumberHint);
      return;
    }
    setLookupLoading(true);
    setAddressHint(null);
    try {
      const result = await geocodeText(mapsApiKey, query, { regionCode: "UA" });
      if (!result) return;
      const merged = mergeFormattedAddressWithUserDetail(query, result.formattedAddress || query);
      setForm((prev) => ({
        ...prev,
        addressText: merged,
        city: prev.city.trim() || result.city || resolveCityFromGoogleAddress(merged) || prev.city,
        lat: result.lat,
        lng: result.lng,
        googlePlaceId: result.placeId ?? prev.googlePlaceId,
      }));
      setMapOpen(true);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSave = async () => {
    const addressText = form.addressText.trim();
    if (!addressText) {
      setError("Введіть адресу");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: form.label.trim() || null,
        city: form.city.trim() || null,
        addressText,
        lat: form.lat,
        lng: form.lng,
        googlePlaceId: form.googlePlaceId,
      };
      if (editingId) {
        await entityAddressesApi.update(entityType, entityId, editingId, payload);
      } else {
        await entityAddressesApi.create(entityType, entityId, {
          ...payload,
          isDefault: items.length === 0,
        });
      }
      closeForm();
      await load();
      onUpdated?.();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Помилка збереження");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (addressId: string) => {
    setMutatingId(addressId);
    try {
      await entityAddressesApi.delete(entityType, entityId, addressId);
      await load();
      onUpdated?.();
    } finally {
      setMutatingId(null);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    setMutatingId(addressId);
    try {
      await entityAddressesApi.setDefault(entityType, entityId, addressId);
      await load();
      onUpdated?.();
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-500">Адреси</span>
        {!formOpen ? (
          <button
            type="button"
            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={openCreate}
          >
            + Додати адресу
          </button>
        ) : null}
      </div>

      {loading ? <p className="text-xs text-zinc-400">Завантаження…</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {!loading && items.length === 0 && !formOpen ? (
        <p className="text-xs text-zinc-400">Немає адрес. Додайте місто та адресу вручну або привʼяжіть на карті.</p>
      ) : null}

      <ul className="space-y-2">
        {items.map((row) => {
          const missingCoords = !row.hasCoordinates;
          const highlight = highlightMissingCoords && missingCoords;
          return (
            <li
              key={row.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                highlight ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">{row.displayLine}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-500">
                    {row.label ? <span>{row.label}</span> : null}
                    {row.isDefault ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">Основний</span>
                    ) : null}
                    {row.hasCoordinates ? (
                      <span className="text-emerald-700">Є координати</span>
                    ) : (
                      <span className={highlight ? "text-red-600" : "text-amber-700"}>Без координат</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {!row.isDefault ? (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      disabled={disabled || mutatingId === row.id}
                      onClick={() => void handleSetDefault(row.id)}
                    >
                      Зробити основним
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-zinc-600 hover:underline disabled:opacity-50"
                    disabled={disabled || mutatingId === row.id}
                    onClick={() => openEdit(row)}
                  >
                    Редагувати
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    disabled={disabled || mutatingId === row.id}
                    onClick={() => void handleDelete(row.id)}
                  >
                    Видалити
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {formOpen ? (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Мітка</span>
              <input
                className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Клиника, кабінет…"
                disabled={saving || disabled}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Місто</span>
              <input
                className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                placeholder="Київ"
                disabled={saving || disabled}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Адреса</span>
            <div ref={anchorRef} className="relative">
              <input
                className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={form.addressText}
                onChange={(e) => {
                  googleQueryRef.current = e.target.value;
                  setForm((p) => ({
                    ...p,
                    addressText: e.target.value,
                    lat: null,
                    lng: null,
                    googlePlaceId: null,
                  }));
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                placeholder="вул. …, буд. …"
                disabled={saving || disabled}
              />
              <AddressSuggestionsDropdown
                open={showSuggestions && !!mapsApiKey}
                anchorRef={anchorRef}
                suggestions={suggestions}
                onSelect={(s) => void handleSelectSuggestion(s)}
              />
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {lookupLoading ? <span>Пошук…</span> : null}
            {addressHint ? <span className="text-amber-700">{addressHint}</span> : null}
            {form.lat != null && form.lng != null ? (
              <span className="text-emerald-700">Координати задано</span>
            ) : (
              <span>Координати не задано</span>
            )}
            {mapsApiKey ? (
              <>
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:underline"
                  disabled={saving || disabled}
                  onClick={() => void geocodeManual()}
                >
                  Привʼязати на карті
                </button>
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:underline"
                  disabled={saving || disabled}
                  onClick={() => setMapOpen((v) => !v)}
                >
                  {mapOpen ? "Сховати карту" : "Показати карту"}
                </button>
              </>
            ) : null}
          </div>

          {mapOpen && form.lat != null && form.lng != null && isGoogleLoaded && mapsApiKey ? (
            <div className="h-40 overflow-hidden rounded-md border border-zinc-200">
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={{ lat: form.lat, lng: form.lng }}
                zoom={15}
              >
                <Marker
                  position={{ lat: form.lat, lng: form.lng }}
                  draggable
                  onDragEnd={(e) => {
                    const lat = e.latLng?.lat();
                    const lng = e.latLng?.lng();
                    if (lat != null && lng != null) {
                      setForm((p) => ({ ...p, lat, lng }));
                    }
                  }}
                />
              </GoogleMap>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              disabled={saving || disabled}
              onClick={() => void handleSave()}
            >
              {saving ? "Збереження…" : editingId ? "Зберегти" : "Додати"}
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700"
              disabled={saving}
              onClick={closeForm}
            >
              Скасувати
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Addresses suitable for visit planning (must have coordinates). */
export function pickVisitReadyAddresses(items: EntityAddress[]): EntityAddress[] {
  return items.filter((a) => a.hasCoordinates);
}

export function formatAddressOptionLabel(row: EntityAddress): string {
  const parts = [row.displayLine];
  if (row.label) parts.push(`(${row.label})`);
  if (row.isDefault) parts.push("— основний");
  return parts.join(" ");
}
