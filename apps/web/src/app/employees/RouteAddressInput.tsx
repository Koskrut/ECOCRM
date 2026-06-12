"use client";

import type { PlaceSuggestion } from "@/lib/googlePlacesNew";
import { useRef } from "react";
import { AddressSuggestionsDropdown } from "@/components/inputs/AddressSuggestionsDropdown";

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400";

type Props = {
  label: string;
  placeholder: string;
  descriptionHint?: string;
  value: string;
  disabled?: boolean;
  mapsApiKey: string | null;
  mapsConfigHint: string | null;
  suggestionsOpen: boolean;
  suggestions: PlaceSuggestion[];
  lookupLoading: boolean;
  geocodeLoading: boolean;
  error: string | null;
  addressHint: string | null;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSelectSuggestion: (s: PlaceSuggestion) => void;
  statusSearching: string;
  statusGeocoding: string;
};

export function RouteAddressInput({
  label,
  placeholder,
  descriptionHint,
  value,
  disabled,
  mapsApiKey,
  mapsConfigHint,
  suggestionsOpen,
  suggestions,
  lookupLoading,
  geocodeLoading,
  error,
  addressHint,
  onChange,
  onFocus,
  onBlur,
  onSelectSuggestion,
  statusSearching,
  statusGeocoding,
}: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null);

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      {descriptionHint ? <p className="mt-0.5 text-xs text-zinc-500">{descriptionHint}</p> : null}
      <div ref={anchorRef} className="relative mt-1">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        <AddressSuggestionsDropdown
          open={suggestionsOpen}
          anchorRef={anchorRef}
          suggestions={suggestions}
          onSelect={onSelectSuggestion}
        />
      </div>
      <div className="mt-1 min-h-[1rem] text-xs text-zinc-500">
        {lookupLoading && mapsApiKey ? statusSearching : null}
        {!lookupLoading && geocodeLoading ? statusGeocoding : null}
        {!lookupLoading && !geocodeLoading && addressHint ? (
          <span className="text-amber-700">{addressHint}</span>
        ) : null}
        {!lookupLoading && !geocodeLoading && error ? (
          <span className="text-red-600">{error}</span>
        ) : null}
        {!lookupLoading && !geocodeLoading && !error && !addressHint && !mapsApiKey ? mapsConfigHint : null}
      </div>
    </div>
  );
}
