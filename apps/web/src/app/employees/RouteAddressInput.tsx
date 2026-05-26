"use client";

import type { PlaceSuggestion } from "@/lib/googlePlacesNew";

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400";

type Props = {
  label: string;
  placeholder: string;
  hint?: string;
  value: string;
  disabled?: boolean;
  mapsApiKey: string | null;
  mapsConfigHint: string | null;
  suggestionsOpen: boolean;
  suggestions: PlaceSuggestion[];
  lookupLoading: boolean;
  geocodeLoading: boolean;
  error: string | null;
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
  hint,
  value,
  disabled,
  mapsApiKey,
  mapsConfigHint,
  suggestionsOpen,
  suggestions,
  lookupLoading,
  geocodeLoading,
  error,
  onChange,
  onFocus,
  onBlur,
  onSelectSuggestion,
  statusSearching,
  statusGeocoding,
}: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
      <div className="relative mt-1">
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
        {suggestionsOpen && suggestions.length > 0 ? (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void onSelectSuggestion(s);
                }}
              >
                {s.description}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-1 min-h-[1rem] text-xs text-zinc-500">
        {lookupLoading && mapsApiKey ? statusSearching : null}
        {!lookupLoading && geocodeLoading ? statusGeocoding : null}
        {!lookupLoading && !geocodeLoading && error ? (
          <span className="text-red-600">{error}</span>
        ) : null}
        {!lookupLoading && !geocodeLoading && !error && !mapsApiKey ? mapsConfigHint : null}
      </div>
    </div>
  );
}
