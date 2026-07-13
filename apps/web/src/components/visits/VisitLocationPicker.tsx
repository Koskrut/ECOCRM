"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AddressSuggestionsDropdown } from "@/components/inputs/AddressSuggestionsDropdown";
import {
  formatAddressOptionLabel,
  pickVisitReadyAddresses,
} from "@/components/EntityAddressesSection";
import type { EntityAddress } from "@/lib/api/resources/entity-addresses";
import { autocompleteAddress, geocodePlace } from "@/lib/googlePlacesNew";
import type { VisitLocationValue } from "@/lib/visits/visit-location.types";
import { visitLocationHasCoords } from "@/lib/visits/visit-location.types";
import { strings } from "@/locales";

type Props = {
  entityType: "contact" | "company";
  addresses: EntityAddress[];
  value: VisitLocationValue | null;
  onChange: (value: VisitLocationValue) => void;
  mapsApiKey: string | null;
  error?: boolean;
  disabled?: boolean;
};

export function VisitLocationPicker({
  entityType,
  addresses,
  value,
  onChange,
  mapsApiKey,
  error = false,
  disabled = false,
}: Props) {
  const visitReady = pickVisitReadyAddresses(addresses);
  const [mode, setMode] = useState<"entity" | "other">(value?.mode ?? "entity");
  const [searchText, setSearchText] = useState(value?.mode === "other" ? value.addressText : "");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof autocompleteAddress>>>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const entityAddressId =
    value?.mode === "entity" ? value.addressId : visitReady[0]?.id ?? "";

  useEffect(() => {
    if (value?.mode === "other") {
      setMode("other");
      setSearchText(value.addressText);
    } else if (value?.mode === "entity") {
      setMode("entity");
    }
  }, [value?.mode, value?.mode === "other" ? value.addressText : null]);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      autocompleteAbortRef.current?.abort();
    },
    [],
  );

  const selectEntityAddress = useCallback(
    (addressId: string) => {
      const row = visitReady.find((a) => a.id === addressId);
      if (!row || row.lat == null || row.lng == null) return;
      onChange({
        mode: "entity",
        addressId: row.id,
        addressText: row.displayLine,
        lat: row.lat,
        lng: row.lng,
      });
    },
    [onChange, visitReady],
  );

  const handleModeChange = (next: "entity" | "other") => {
    setMode(next);
    setPlaceError(null);
    if (next === "entity" && visitReady.length > 0) {
      const current =
        value?.mode === "entity"
          ? visitReady.find((a) => a.id === value.addressId)
          : visitReady.find((a) => a.isDefault) ?? visitReady[0];
      if (current?.lat != null && current.lng != null) {
        selectEntityAddress(current.id);
      }
    }
  };

  const handleSelectSuggestion = useCallback(
    async (suggestion: { placeId: string; description: string }) => {
      if (!mapsApiKey) return;
      setSuggestionsOpen(false);
      setSearchText(suggestion.description);
      setGeocodeLoading(true);
      setPlaceError(null);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setPlaceError(strings.visitLocation.geocodeFailed);
          return;
        }
        onChange({
          mode: "other",
          addressText: result.formattedAddress || suggestion.description,
          lat: result.lat,
          lng: result.lng,
        });
      } finally {
        setGeocodeLoading(false);
      }
    },
    [mapsApiKey, onChange],
  );

  useEffect(() => {
    if (mode !== "other" || !mapsApiKey) {
      setSuggestions([]);
      return;
    }
    const query = searchText.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    const timer = setTimeout(() => {
      setLookupLoading(true);
      void autocompleteAddress(mapsApiKey, query, {
        limit: 8,
        regionCode: "UA",
        includedPrimaryTypes: [],
      })
        .then((items) => {
          if (autocompleteAbortRef.current !== controller) return;
          setSuggestions(items);
          setSuggestionsOpen(items.length > 0);
        })
        .finally(() => {
          if (autocompleteAbortRef.current === controller) {
            setLookupLoading(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, mapsApiKey, searchText]);

  const entityLabel =
    entityType === "contact"
      ? strings.visitLocation.clientAddress
      : strings.visitLocation.companyAddress;

  return (
    <div className="space-y-2">
      <span className="text-sm text-zinc-500">{strings.visitLocation.meetingPlace}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || visitReady.length === 0}
          onClick={() => handleModeChange("entity")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            mode === "entity"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          }`}
        >
          {entityLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleModeChange("other")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            mode === "other"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          {strings.visitLocation.otherPlace}
        </button>
      </div>

      {mode === "entity" ? (
        visitReady.length > 0 ? (
          <select
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-zinc-400 ${
              error ? "border-red-500 ring-1 ring-red-500" : "border-zinc-200"
            }`}
            value={entityAddressId}
            disabled={disabled}
            onChange={(e) => selectEntityAddress(e.target.value)}
          >
            {visitReady.map((a) => (
              <option key={a.id} value={a.id}>
                {formatAddressOptionLabel(a)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-red-600">{strings.visitLocation.coordsRequired}</p>
        )
      ) : (
        <div ref={anchorRef} className="relative">
          <input
            type="text"
            value={searchText}
            disabled={disabled || !mapsApiKey}
            placeholder={strings.visitLocation.searchPlaceholder}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-zinc-400 ${
              error || placeError ? "border-red-500 ring-1 ring-red-500" : "border-zinc-200"
            }`}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPlaceError(null);
            }}
            onFocus={() => {
              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
              if (suggestions.length > 0) setSuggestionsOpen(true);
            }}
            onBlur={() => {
              blurTimeoutRef.current = setTimeout(() => setSuggestionsOpen(false), 150);
            }}
          />
          <AddressSuggestionsDropdown
            open={suggestionsOpen}
            anchorRef={anchorRef}
            suggestions={suggestions}
            onSelect={(s) => void handleSelectSuggestion(s)}
          />
          {lookupLoading || geocodeLoading ? (
            <p className="mt-1 text-xs text-zinc-500">{strings.visitLocation.searching}</p>
          ) : null}
          {!mapsApiKey ? (
            <p className="mt-1 text-xs text-amber-600">{strings.visitLocation.mapsKeyRequired}</p>
          ) : null}
          {placeError ? <p className="mt-1 text-xs text-red-600">{placeError}</p> : null}
          {value?.mode === "other" && visitLocationHasCoords(value) ? (
            <p className="mt-1 text-xs text-zinc-500">{strings.visitLocation.coordsReady}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
