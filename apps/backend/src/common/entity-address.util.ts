export type EntityAddressRecord = {
  city: string | null;
  addressText: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
};

const CITY_KIND_PREFIX = /^(?:місто|м\.|город|г\.)\s+/iu;

/** Drop a leading "місто" / "м." so the city name can be matched inside a Google line. */
export function normalizeCityLabel(city: string): string {
  return city.replace(CITY_KIND_PREFIX, "").trim();
}

function indexOfCityToken(text: string, city: string): number {
  const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[,\\s]+)(${escaped})(?=$|[,\\s])`, "iu");
  const match = re.exec(text);
  if (!match || match[1] == null) return -1;
  return match.index + match[0].length - match[1].length;
}

/**
 * One scannable line: "Одеса, Kuznechna St, 49".
 * If the street text already contains the city, region and postal code after it are dropped.
 */
export function formatEntityAddressLine(
  city: string | null | undefined,
  addressText: string | null | undefined,
): string {
  const cityName = normalizeCityLabel(city?.trim() ?? "");
  const textTrim = addressText?.trim() ?? "";
  if (cityName && textTrim) {
    const at = indexOfCityToken(textTrim, cityName);
    if (at >= 0) {
      const street = textTrim.slice(0, at).replace(/[,\s]+$/g, "");
      if (street) return `${cityName}, ${street}`;
      return textTrim;
    }
    return `${cityName}, ${textTrim}`;
  }
  return textTrim || cityName;
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
