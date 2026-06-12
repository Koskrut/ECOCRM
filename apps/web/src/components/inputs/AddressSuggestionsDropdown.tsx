"use client";

import { useRef, type RefObject } from "react";
import { FixedDropdownPortal } from "@/components/overlays/FixedDropdownPortal";
import type { PlaceSuggestion } from "@/lib/googlePlacesNew";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  suggestions: PlaceSuggestion[];
  onSelect: (suggestion: PlaceSuggestion) => void;
};

export function AddressSuggestionsDropdown({ open, anchorRef, suggestions, onSelect }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  if (!open || suggestions.length === 0) return null;

  return (
    <FixedDropdownPortal open={open} anchorRef={anchorRef} panelRef={panelRef} maxHeight="12rem">
      {suggestions.map((s) => (
        <button
          key={s.placeId}
          type="button"
          className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s);
          }}
        >
          {s.description}
        </button>
      ))}
    </FixedDropdownPortal>
  );
}
