import type { CompanyAddress } from "@/types/crm";

export type VisitLocationValue =
  | {
      mode: "entity";
      addressId: string;
      addressText: string;
      lat: number;
      lng: number;
    }
  | {
      mode: "other";
      addressText: string;
      lat: number;
      lng: number;
    };

export function visitLocationHasCoords(value: VisitLocationValue | null | undefined): boolean {
  if (!value) return false;
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && !!value.addressText.trim();
}

export function defaultVisitLocationFromAddresses(
  addresses: CompanyAddress[],
): VisitLocationValue | null {
  const ready = addresses.filter((a) => a.hasCoordinates && a.lat != null && a.lng != null);
  const row = ready.find((a) => a.isDefault) ?? ready[0];
  if (!row) return null;
  return {
    mode: "entity",
    addressId: row.id,
    addressText: row.displayLine,
    lat: row.lat as number,
    lng: row.lng as number,
  };
}

export function buildVisitLocationCreatePayload(
  value: VisitLocationValue,
  entityType: "contact" | "company" = "contact",
): {
  contactAddressId?: string;
  companyAddressId?: string;
  addressText: string;
  lat: number;
  lng: number;
  locationSource?: "GEOCODED";
} {
  if (value.mode === "entity" && !value.addressId.startsWith("__legacy__")) {
    return {
      ...(entityType === "contact"
        ? { contactAddressId: value.addressId }
        : { companyAddressId: value.addressId }),
      addressText: value.addressText,
      lat: value.lat,
      lng: value.lng,
    };
  }
  if (value.mode === "entity") {
    return {
      addressText: value.addressText,
      lat: value.lat,
      lng: value.lng,
    };
  }
  return {
    addressText: value.addressText,
    lat: value.lat,
    lng: value.lng,
    locationSource: "GEOCODED",
  };
}

export function buildVisitLocationUpdatePayload(
  value: VisitLocationValue,
  entityType: "contact" | "company" = "contact",
): {
  contactAddressId?: string | null;
  companyAddressId?: string | null;
  addressText: string;
  lat: number;
  lng: number;
  locationSource: "GEOCODED" | "FROM_CONTACT";
} {
  if (value.mode === "entity" && !value.addressId.startsWith("__legacy__")) {
    return {
      ...(entityType === "contact"
        ? { contactAddressId: value.addressId, companyAddressId: null }
        : { companyAddressId: value.addressId, contactAddressId: null }),
      addressText: value.addressText,
      lat: value.lat,
      lng: value.lng,
      locationSource: "FROM_CONTACT",
    };
  }
  if (value.mode === "entity") {
    return {
      contactAddressId: null,
      companyAddressId: null,
      addressText: value.addressText,
      lat: value.lat,
      lng: value.lng,
      locationSource: "FROM_CONTACT",
    };
  }
  return {
    contactAddressId: null,
    companyAddressId: null,
    addressText: value.addressText,
    lat: value.lat,
    lng: value.lng,
    locationSource: "GEOCODED",
  };
}

export function visitLocationFromVisit(
  visit: {
    contactAddressId?: string | null;
    addressText?: string | null;
    lat?: number | null;
    lng?: number | null;
    locationSource?: string | null;
  },
  addresses: CompanyAddress[],
): VisitLocationValue | null {
  if (visit.lat == null || visit.lng == null || !visit.addressText?.trim()) return null;
  if (visit.contactAddressId && addresses.some((a) => a.id === visit.contactAddressId)) {
    return {
      mode: "entity",
      addressId: visit.contactAddressId,
      addressText: visit.addressText.trim(),
      lat: visit.lat,
      lng: visit.lng,
    };
  }
  if (
    visit.locationSource === "GEOCODED" ||
    visit.locationSource === "PIN_ADJUSTED" ||
    visit.locationSource === "GPS_SET" ||
    !visit.contactAddressId
  ) {
    return {
      mode: "other",
      addressText: visit.addressText.trim(),
      lat: visit.lat,
      lng: visit.lng,
    };
  }
  return defaultVisitLocationFromAddresses(addresses);
}
