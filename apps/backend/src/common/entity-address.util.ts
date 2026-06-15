export type EntityAddressRecord = {
  city: string | null;
  addressText: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
};

export function formatEntityAddressLine(
  city: string | null | undefined,
  addressText: string | null | undefined,
): string {
  const cityTrim = city?.trim() ?? "";
  const textTrim = addressText?.trim() ?? "";
  if (cityTrim && textTrim) {
    if (textTrim.toLowerCase().includes(cityTrim.toLowerCase())) return textTrim;
    return `${cityTrim}, ${textTrim}`;
  }
  return textTrim || cityTrim;
}

export function contactDenormalizedFromDefault(
  defaultAddress: EntityAddressRecord | null | undefined,
): {
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  addressInfo: string | null;
} {
  if (!defaultAddress) {
    return {
      address: null,
      city: null,
      lat: null,
      lng: null,
      googlePlaceId: null,
      addressInfo: null,
    };
  }
  const line = formatEntityAddressLine(defaultAddress.city, defaultAddress.addressText);
  return {
    address: defaultAddress.lat != null && defaultAddress.lng != null ? line : null,
    city: defaultAddress.city?.trim() || null,
    lat: defaultAddress.lat,
    lng: defaultAddress.lng,
    googlePlaceId: defaultAddress.googlePlaceId,
    addressInfo: defaultAddress.addressText.trim() || null,
  };
}

export function companyDenormalizedFromDefault(
  defaultAddress: EntityAddressRecord | null | undefined,
): {
  address: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
} {
  if (!defaultAddress) {
    return { address: null, lat: null, lng: null, googlePlaceId: null };
  }
  return {
    address: formatEntityAddressLine(defaultAddress.city, defaultAddress.addressText) || null,
    lat: defaultAddress.lat,
    lng: defaultAddress.lng,
    googlePlaceId: defaultAddress.googlePlaceId,
  };
}

export function mapAddressRow<T extends {
  id: string;
  label: string | null;
  city: string | null;
  addressText: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}>(row: T) {
  return {
    id: row.id,
    label: row.label,
    city: row.city,
    addressText: row.addressText,
    lat: row.lat,
    lng: row.lng,
    googlePlaceId: row.googlePlaceId,
    isDefault: row.isDefault,
    displayLine: formatEntityAddressLine(row.city, row.addressText),
    hasCoordinates: row.lat != null && row.lng != null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
