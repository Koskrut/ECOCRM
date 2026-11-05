const CITY_KIND_PREFIX = /^(?:місто|м\.|город|г\.)\s+/iu;

function normalizeCityLabel(city: string): string {
  return city.replace(CITY_KIND_PREFIX, "").trim();
}

function indexOfCityToken(text: string, city: string): number {
  const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[,\\s]+)(${escaped})(?=$|[,\\s])`, "iu");
  const match = re.exec(text);
  if (!match || match[1] == null) return -1;
  return match.index + match[0].length - match[1].length;
}

/** Same rules as the API `formatEntityAddressLine`: one line, without a repeated city or the region tail. */
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
