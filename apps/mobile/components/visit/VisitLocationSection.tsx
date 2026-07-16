import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/Themed";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { companiesApi } from "@/lib/api/companies";
import { contactsApi } from "@/lib/api/contacts";
import { autocompleteAddress, geocodePlace } from "@/lib/google-places";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  defaultVisitLocationFromAddresses,
  type VisitLocationValue,
} from "@/lib/visit-location.types";
import type { Company, CompanyAddress, Contact } from "@/types/crm";

const LEGACY_ADDRESS_ID = "__legacy__";

type Props = {
  token: string;
  contact?: Contact | null;
  company?: Company | null;
  value: VisitLocationValue | null;
  onChange: (value: VisitLocationValue) => void;
  mapsApiKey: string | null;
  disabled?: boolean;
};

function legacyEntityAddress(entity: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}): CompanyAddress | null {
  if (entity.lat == null || entity.lng == null || !entity.address?.trim()) return null;
  return {
    id: LEGACY_ADDRESS_ID,
    label: null,
    city: null,
    addressText: entity.address,
    lat: entity.lat,
    lng: entity.lng,
    googlePlaceId: null,
    isDefault: true,
    displayLine: entity.address,
    hasCoordinates: true,
    createdAt: "",
    updatedAt: "",
  };
}

export function VisitLocationSection({
  token,
  contact,
  company,
  value,
  onChange,
  mapsApiKey,
  disabled = false,
}: Props) {
  const theme = useTheme();
  const entityType = company ? "company" : "contact";
  const entityKey = company?.id ?? contact?.id ?? "";
  const [mode, setMode] = useState<"entity" | "other">(value?.mode ?? "entity");
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [searchText, setSearchText] = useState(value?.mode === "other" ? value.addressText : "");
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof autocompleteAddress>>>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const readyAddresses = useMemo(() => {
    const fromApi = addresses.filter((a) => a.hasCoordinates && a.lat != null && a.lng != null);
    if (fromApi.length > 0) return fromApi;
    const legacy = legacyEntityAddress(company ?? contact ?? {});
    return legacy ? [legacy] : [];
  }, [addresses, contact, company]);

  useEffect(() => {
    let cancelled = false;
    if (!entityKey) {
      setAddresses([]);
      setLoadingAddresses(false);
      return;
    }
    setLoadingAddresses(true);
    const load =
      entityType === "company"
        ? companiesApi.getAddresses(token, entityKey).then((res) => res.items ?? [])
        : contactsApi.listAddresses(token, entityKey);
    void load
      .then((items) => {
        if (!cancelled) setAddresses(items);
      })
      .catch(() => {
        if (!cancelled) setAddresses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAddresses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, entityKey, entityType]);

  useEffect(() => {
    if (value?.mode === "other") {
      setMode("other");
      setSearchText(value.addressText);
      return;
    }
    if (value?.mode === "entity") {
      setMode("entity");
      return;
    }
    if (!value) {
      const def = defaultVisitLocationFromAddresses(readyAddresses);
      if (def) onChange(def);
    }
  }, [readyAddresses, value, onChange]);

  const selectEntityAddress = useCallback(
    (addressId: string) => {
      const row = readyAddresses.find((a) => a.id === addressId);
      if (!row || row.lat == null || row.lng == null) return;
      onChange({
        mode: "entity",
        addressId: row.id,
        addressText: row.displayLine,
        lat: row.lat,
        lng: row.lng,
      });
    },
    [onChange, readyAddresses],
  );

  const handleModeChange = (next: "entity" | "other") => {
    setMode(next);
    setPlaceError(null);
    if (next === "entity" && readyAddresses.length > 0) {
      const current =
        value?.mode === "entity"
          ? readyAddresses.find((a) => a.id === value.addressId)
          : readyAddresses.find((a) => a.isDefault) ?? readyAddresses[0];
      if (current) selectEntityAddress(current.id);
    }
  };

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
    const timer = setTimeout(() => {
      setLookupLoading(true);
      void autocompleteAddress(mapsApiKey, query, { limit: 8, regionCode: "UA" })
        .then(setSuggestions)
        .finally(() => setLookupLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [mode, mapsApiKey, searchText]);

  const handleSelectSuggestion = async (placeId: string, description: string) => {
    if (!mapsApiKey) return;
    setGeocodeLoading(true);
    setPlaceError(null);
    try {
      const result = await geocodePlace(mapsApiKey, placeId);
      if (!result) {
        setPlaceError(t("visitLocation.geocodeFailed"));
        return;
      }
      setSearchText(result.formattedAddress || description);
      onChange({
        mode: "other",
        addressText: result.formattedAddress || description,
        lat: result.lat,
        lng: result.lng,
      });
      setSuggestions([]);
    } finally {
      setGeocodeLoading(false);
    }
  };

  const entityAddressId = value?.mode === "entity" ? value.addressId : readyAddresses[0]?.id ?? "";

  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
        {t("visitLocation.meetingPlace")}
      </Text>
      <SegmentedControl
        options={[
          { value: "entity" as const, label: t("visitLocation.clientAddress") },
          { value: "other" as const, label: t("visitLocation.otherPlace") },
        ]}
        value={mode}
        onChange={handleModeChange}
      />

      {mode === "entity" ? (
        loadingAddresses ? (
          <ActivityIndicator style={{ marginTop: theme.spacing.md }} color={theme.colors.primary} />
        ) : readyAddresses.length > 0 ? (
          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
            {readyAddresses.map((addr) => (
              <Chip
                key={addr.id}
                label={addr.displayLine || addr.addressText}
                selected={entityAddressId === addr.id}
                onPress={() => !disabled && selectEntityAddress(addr.id)}
              />
            ))}
          </View>
        ) : (
          <Text style={[theme.typography.caption, { color: theme.colors.warning, marginTop: theme.spacing.md }]}>
            {t("visits.noCoords")}
          </Text>
        )
      ) : (
        <View style={{ marginTop: theme.spacing.md }}>
          <TextField
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t("visitLocation.searchPlaceholder")}
            editable={!disabled && !geocodeLoading}
          />
          {lookupLoading || geocodeLoading ? (
            <ActivityIndicator style={{ marginTop: theme.spacing.sm }} color={theme.colors.primary} />
          ) : null}
          {placeError ? (
            <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: 8 }]}>
              {placeError}
            </Text>
          ) : null}
          {suggestions.length > 0 ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 180, marginTop: theme.spacing.sm }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.placeId}
                  onPress={() => void handleSelectSuggestion(s.placeId, s.description)}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={theme.typography.body}>{s.description}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {!mapsApiKey ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
              {t("visitLocation.mapsKeyRequired")}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
