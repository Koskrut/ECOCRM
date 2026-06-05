const COUNTRY_RE = /^(україна|ukraine|украина)$/i;
const POSTAL_RE = /^\d{5}$/;

export type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export function parseCityStreetFromFormattedAddress(
  formattedAddress: string | null | undefined,
): { city: string | null; streetLine: string | null } {
  if (!formattedAddress?.trim()) return { city: null, streetLine: null };

  const parts = formattedAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  while (parts.length > 1) {
    const last = parts[parts.length - 1]!;
    if (COUNTRY_RE.test(last) || POSTAL_RE.test(last)) parts.pop();
    else break;
  }

  if (parts.length === 0) return { city: null, streetLine: null };
  if (parts.length === 1) return { city: null, streetLine: parts[0]! };

  const city = parts[parts.length - 1]!;
  const streetLine = parts.slice(0, -1).join(", ");
  return { city, streetLine };
}

export function extractCityStreetFromGoogleComponents(
  components: GoogleAddressComponent[] | undefined,
): { city: string | null; streetLine: string | null } {
  if (!components?.length) return { city: null, streetLine: null };

  const byType = (type: string) =>
    components.find((c) => c.types?.includes(type))?.longText?.trim() || null;

  const city =
    byType("locality") ||
    byType("postal_town") ||
    byType("administrative_area_level_2") ||
    byType("administrative_area_level_3");

  const route = byType("route");
  const streetNumber = byType("street_number");
  const streetLine = [route, streetNumber].filter(Boolean).join(", ") || null;

  return { city, streetLine };
}

export function formatContactAddressFromGoogle(address: string | null | undefined): string {
  const { city, streetLine } = parseCityStreetFromFormattedAddress(address);
  if (city && streetLine) return `${city}, ${streetLine}`;
  if (city) return city;
  if (streetLine) return streetLine;
  const trimmed = address?.trim();
  return trimmed || "—";
}

export function resolveCityFromGoogleAddress(
  formattedAddress: string,
  components?: GoogleAddressComponent[],
): string | null {
  const fromComponents = extractCityStreetFromGoogleComponents(components).city;
  if (fromComponents) return fromComponents;
  return parseCityStreetFromFormattedAddress(formattedAddress).city;
}
