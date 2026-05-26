"use client";

export type PlaceSuggestion = {
  placeId: string;
  description: string;
};

export type GeocodedPlace = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string;
};

/** Places API (New) autocomplete: each suggestion has placePrediction or queryPrediction */
type PlacesAutocompleteSuggestion = {
  placePrediction?: {
    place?: string;
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
  queryPrediction?: { text?: { text?: string } };
};

type PlacesAutocompleteResponse = {
  suggestions?: PlacesAutocompleteSuggestion[];
};

type PlacesSearchTextPlace = {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

type PlacesSearchTextResponse = {
  places?: PlacesSearchTextPlace[];
};

const PLACES_BASE_URL = "https://places.googleapis.com/v1";

/** Prefer full addresses / buildings (no bare street/route without house number). */
export const ADDRESS_AUTOCOMPLETE_PRIMARY_TYPES = [
  "street_address",
  "premise",
  "subpremise",
] as const;

/** Building numbers from user input (UA/RU/Latin), e.g. 15, 15А, 15/2 */
const HOUSE_NUMBER_RE =
  /\b\d{1,4}[а-яА-Яa-zA-ZёЁіІїЇєЄ]?(?:\/\d+[а-яА-Яa-zA-ZёЁіІїЇєЄ]?)?\b/gu;

export function addressHasHouseNumber(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  HOUSE_NUMBER_RE.lastIndex = 0;
  return HOUSE_NUMBER_RE.test(trimmed);
}

function normalizeAddressCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Keeps house numbers (and similar tokens) the user typed when Google returns only a street/city line.
 */
export function mergeFormattedAddressWithUserDetail(
  userTyped: string,
  apiFormatted: string,
): string {
  const user = userTyped.trim();
  const api = apiFormatted.trim();
  if (!api) return user || api;
  if (!user) return api;

  const apiNorm = normalizeAddressCompare(api);
  const userNorm = normalizeAddressCompare(user);

  if (userNorm.length > apiNorm.length && userNorm.includes(apiNorm)) {
    return user;
  }

  const tokens = [...user.matchAll(HOUSE_NUMBER_RE)].map((m) => m[0]);
  const missing = tokens.filter((t) => {
    const tn = normalizeAddressCompare(t);
    if (!tn) return false;
    return !new RegExp(`(^|[\\s,])${escapeRegExp(tn)}($|[\\s,])`).test(apiNorm);
  });
  if (missing.length === 0) return api;

  const commaIdx = api.indexOf(",");
  if (commaIdx === -1) {
    return `${api} ${missing.join(" ")}`.trim();
  }
  const first = api.slice(0, commaIdx).trim();
  const rest = api.slice(commaIdx).trim();
  return `${first} ${missing.join(" ")}${rest.startsWith(",") ? "" : ", "}${rest}`.trim();
}

function buildPlacesHeaders(mapsApiKey: string, fieldMask?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": mapsApiKey,
  };
  if (fieldMask) headers["X-Goog-FieldMask"] = fieldMask;
  return headers;
}

export async function autocompleteAddress(
  mapsApiKey: string,
  input: string,
  opts?: {
    languageCode?: string;
    regionCode?: string;
    limit?: number;
    /** Empty = no type filter (legacy behavior). Default = address-oriented types. */
    includedPrimaryTypes?: readonly string[];
  },
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (!query || !mapsApiKey) return [];

  const primaryTypes =
    opts?.includedPrimaryTypes !== undefined
      ? opts.includedPrimaryTypes
      : ADDRESS_AUTOCOMPLETE_PRIMARY_TYPES;

  const body = {
    input: query,
    languageCode: opts?.languageCode ?? "ru",
    ...(opts?.regionCode ? { includedRegionCodes: [opts.regionCode] } : {}),
    ...(primaryTypes.length > 0 ? { includedPrimaryTypes: [...primaryTypes] } : {}),
  };

  const tryFetch = async (payload: Record<string, unknown>) =>
    fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
      method: "POST",
      headers: buildPlacesHeaders(mapsApiKey),
      body: JSON.stringify(payload),
    });

  let res = await tryFetch(body);

  if (!res.ok && primaryTypes.length > 0) {
    const errPayload = await safeJson(res);
    console.warn("Places autocomplete failed (retry without type filter)", res.status, errPayload);
    const fallbackBody = {
      input: query,
      languageCode: opts?.languageCode ?? "ru",
      ...(opts?.regionCode ? { includedRegionCodes: [opts.regionCode] } : {}),
    };
    res = await tryFetch(fallbackBody);
  }

  if (!res.ok) {
    console.warn("Places autocomplete failed", res.status, await safeJson(res));
    return [];
  }

  const data = (await res.json()) as PlacesAutocompleteResponse;
  const suggestions = data.suggestions ?? [];

  return suggestions
    .map((s): PlaceSuggestion | null => {
      const pred = s.placePrediction;
      if (!pred) return null;
      const placeId = pred.placeId ?? (pred.place?.replace(/^places\//, "") ?? "");
      const description =
        (pred.text?.text ??
          [pred.structuredFormat?.mainText?.text, pred.structuredFormat?.secondaryText?.text]
            .filter(Boolean)
            .join(", ")) ||
        "";
      if (!placeId || !description) return null;
      return { placeId, description };
    })
    .filter((s): s is PlaceSuggestion => !!s)
    .slice(0, opts?.limit ?? 6);
}

export async function geocodePlace(
  mapsApiKey: string,
  placeId: string,
): Promise<GeocodedPlace | null> {
  if (!placeId || !mapsApiKey) return null;

  const fields = [
    "formattedAddress",
    "location",
  ];

  const res = await fetch(
    `${PLACES_BASE_URL}/places/${encodeURIComponent(
      placeId,
    )}?fields=${encodeURIComponent(fields.join(","))}`,
    {
      method: "GET",
      headers: buildPlacesHeaders(mapsApiKey),
    },
  );

  if (!res.ok) {
    console.warn("Places details failed", res.status, await safeJson(res));
    return null;
  }

  const data = await res.json();
  const formattedAddress: string | undefined = data.formattedAddress;
  const lat: number | undefined = data.location?.latitude;
  const lng: number | undefined = data.location?.longitude;

  if (lat == null || lng == null) return null;

  return {
    lat,
    lng,
    formattedAddress: formattedAddress ?? "",
    placeId,
  };
}

export async function geocodeText(
  mapsApiKey: string,
  textQuery: string,
  opts?: { languageCode?: string; regionCode?: string },
): Promise<GeocodedPlace | null> {
  const query = textQuery.trim();
  if (!query || !mapsApiKey) return null;

  const body = {
    textQuery: query,
    languageCode: opts?.languageCode ?? "ru",
    ...(opts?.regionCode ? { regionCode: opts.regionCode } : {}),
    maxResultCount: 1,
  };

  const res = await fetch(`${PLACES_BASE_URL}/places:searchText`, {
    method: "POST",
    headers: buildPlacesHeaders(
      mapsApiKey,
      "places.id,places.formattedAddress,places.location",
    ),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn("Places searchText failed", res.status, await safeJson(res));
    return null;
  }

  const data = (await res.json()) as PlacesSearchTextResponse;
  const place = data.places?.[0];
  if (!place) return null;

  const lat: number | undefined = place.location?.latitude;
  const lng: number | undefined = place.location?.longitude;
  if (lat == null || lng == null) return null;

  return {
    lat,
    lng,
    formattedAddress: place.formattedAddress ?? query,
    placeId: place.id ?? "",
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

