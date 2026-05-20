/** Visit row with optional linked contact / company coordinates (карточка компании или контакта). */
export type VisitCoordinateSources = {
  lat: number | null;
  lng: number | null;
  contact?: { lat: number | null; lng: number | null } | null;
  company?: { lat: number | null; lng: number | null } | null;
};

/**
 * Effective map point for routing / fuel: visit.lat/lng, else company, else contact.
 */
export function effectiveVisitLatLng(
  visit: VisitCoordinateSources,
): { lat: number; lng: number } | null {
  if (visit.lat != null && visit.lng != null) {
    return { lat: visit.lat, lng: visit.lng };
  }
  if (visit.company?.lat != null && visit.company?.lng != null) {
    return { lat: visit.company.lat, lng: visit.company.lng };
  }
  if (visit.contact?.lat != null && visit.contact?.lng != null) {
    return { lat: visit.contact.lat, lng: visit.contact.lng };
  }
  return null;
}

export function visitHasRoutableCoordinates(visit: VisitCoordinateSources): boolean {
  return effectiveVisitLatLng(visit) != null;
}
