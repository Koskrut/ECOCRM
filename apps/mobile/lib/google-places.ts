const PLACES_BASE_URL = "https://places.googleapis.com/v1";

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

type PlacesAutocompleteSuggestion = {
  placePrediction?: {
    place?: string;
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
};

type PlacesAutocompleteResponse = {
  suggestions?: PlacesAutocompleteSuggestion[];
};

type PlacesDetailsResponse = {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

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
  opts?: { limit?: number; regionCode?: string },
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (!query || !mapsApiKey) return [];

  const body = {
    input: query,
    languageCode: "uk",
    ...(opts?.regionCode ? { includedRegionCodes: [opts.regionCode] } : {}),
  };

  const res = await fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: "POST",
    headers: buildPlacesHeaders(mapsApiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as PlacesAutocompleteResponse;
  return (data.suggestions ?? [])
    .map((s): PlaceSuggestion | null => {
      const pred = s.placePrediction;
      if (!pred) return null;
      const placeId = pred.placeId ?? pred.place?.replace(/^places\//, "") ?? "";
      const description =
        pred.text?.text ??
        [pred.structuredFormat?.mainText?.text, pred.structuredFormat?.secondaryText?.text]
          .filter(Boolean)
          .join(", ") ??
        "";
      if (!placeId || !description) return null;
      return { placeId, description };
    })
    .filter((s): s is PlaceSuggestion => !!s)
    .slice(0, opts?.limit ?? 8);
}

export async function geocodePlace(
  mapsApiKey: string,
  placeId: string,
): Promise<GeocodedPlace | null> {
  if (!placeId || !mapsApiKey) return null;

  const res = await fetch(
    `${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}?fields=${encodeURIComponent("formattedAddress,location")}`,
    {
      method: "GET",
      headers: buildPlacesHeaders(mapsApiKey),
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as PlacesDetailsResponse;
  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (lat == null || lng == null) return null;

  return {
    lat,
    lng,
    formattedAddress: data.formattedAddress ?? "",
    placeId,
  };
}
