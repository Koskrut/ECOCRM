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
  opts?: { languageCode?: string; regionCode?: string; limit?: number },
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (!query || !mapsApiKey) return [];

  const body = {
    input: query,
    languageCode: opts?.languageCode ?? "ru",
    ...(opts?.regionCode ? { includedRegionCodes: [opts.regionCode] } : {}),
  };

  const res = await fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: "POST",
    headers: buildPlacesHeaders(mapsApiKey),
    body: JSON.stringify(body),
  });

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

