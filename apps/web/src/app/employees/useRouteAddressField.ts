"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addressHasHouseNumber,
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  mergeFormattedAddressWithUserDetail,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";
import { strings } from "@/locales";

export function useRouteAddressField(mapsApiKey: string | null, open: boolean) {
  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const lastGeocodedRef = useRef<string>("");

  const reset = useCallback((next: { label?: string; lat?: string; lng?: string }) => {
    setLabel(next.label ?? "");
    setLat(next.lat ?? "");
    setLng(next.lng ?? "");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setLookupLoading(false);
    setGeocodeLoading(false);
    setError(null);
    lastGeocodedRef.current = "";
  }, []);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    },
    [],
  );

  const geocodeFromText = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!mapsApiKey || q.length < 3) return;
      if (lastGeocodedRef.current === q) return;
      if (!addressHasHouseNumber(q)) {
        lastGeocodedRef.current = "";
        setLat("");
        setLng("");
        setError(strings.common.houseNumberRequired);
        return;
      }
      lastGeocodedRef.current = q;
      setError(null);
      setGeocodeLoading(true);
      try {
        const result = await geocodeText(mapsApiKey, q, { regionCode: "UA" });
        if (!result) {
          setError("Address service temporarily unavailable.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(q, result.formattedAddress || q);
        if (!addressHasHouseNumber(merged)) {
          lastGeocodedRef.current = "";
          setLabel(merged);
          setLat("");
          setLng("");
          setError(strings.common.houseNumberRequired);
          return;
        }
        setLabel(merged);
        setLat(String(result.lat));
        setLng(String(result.lng));
        lastGeocodedRef.current = merged.trim();
      } catch {
        setError("Address service temporarily unavailable.");
      } finally {
        setGeocodeLoading(false);
      }
    },
    [mapsApiKey],
  );

  const selectSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!mapsApiKey) return;
      const userTypedBeforeSelect = label.trim();
      setLabel(suggestion.description);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setError(null);
      setGeocodeLoading(true);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setError("Address service temporarily unavailable.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(
          userTypedBeforeSelect,
          result.formattedAddress || suggestion.description,
        );
        if (!addressHasHouseNumber(merged)) {
          setLabel(merged);
          setLat("");
          setLng("");
          lastGeocodedRef.current = "";
          setError(strings.common.houseNumberRequired);
          return;
        }
        setLabel(merged);
        setLat(String(result.lat));
        setLng(String(result.lng));
        lastGeocodedRef.current = merged.trim();
      } catch {
        setError("Address service temporarily unavailable.");
      } finally {
        setGeocodeLoading(false);
      }
    },
    [label, mapsApiKey],
  );

  useEffect(() => {
    if (!open || !suggestionsOpen || !mapsApiKey) {
      setSuggestions([]);
      return;
    }
    const query = label.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    setLookupLoading(true);
    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const items = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (autocompleteAbortRef.current !== controller) return;
        setSuggestions(items);
        setError(null);
      } catch {
        if (autocompleteAbortRef.current !== controller) return;
        setSuggestions([]);
        setError("Address service temporarily unavailable.");
      } finally {
        if (autocompleteAbortRef.current === controller) setLookupLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      autocompleteAbortRef.current = null;
    };
  }, [label, mapsApiKey, open, suggestionsOpen]);

  const onLabelChange = (value: string) => {
    setLabel(value);
    lastGeocodedRef.current = "";
    setError(null);
  };

  const onFocus = () => setSuggestionsOpen(true);

  const onBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setSuggestionsOpen(false), 120);
    if (label.trim().length >= 3 && mapsApiKey) void geocodeFromText(label);
  };

  return {
    label,
    lat,
    lng,
    setLat,
    setLng,
    suggestionsOpen,
    suggestions,
    lookupLoading,
    geocodeLoading,
    error,
    reset,
    onLabelChange,
    onFocus,
    onBlur,
    selectSuggestion,
  };
}
