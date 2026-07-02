import { t } from "@/lib/i18n";
import type { ContactShippingProfile, NpDeliveryType } from "@/types/crm";

export function shippingProfileDeliveryTypeLabel(deliveryType: NpDeliveryType): string {
  if (deliveryType === "WAREHOUSE") return t("shipping.warehouse");
  if (deliveryType === "POSTOMAT") return t("shipping.postomat");
  return t("shipping.addressCourier");
}

export function isGenericShippingLabel(label: string | null | undefined): boolean {
  const lbl = label?.trim();
  if (!lbl) return true;
  return (
    lbl === t("shipping.warehouse") ||
    lbl === t("shipping.postomat") ||
    lbl === t("shipping.addressCourier") ||
    lbl === "Відділення" ||
    lbl === "Поштомат" ||
    lbl === "Кур'єрська доставка"
  );
}

export function shippingProfileRecipientName(profile: ContactShippingProfile): string | null {
  if (profile.recipientType === "COMPANY") {
    const contactPerson = [
      profile.contactPersonLastName,
      profile.contactPersonFirstName,
      profile.contactPersonMiddleName,
    ]
      .filter(Boolean)
      .join(" ");
    if (contactPerson) return contactPerson;
    return profile.companyName?.trim() || null;
  }

  const name = [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(" ");
  return name || null;
}

export function shippingProfileRecipientSubtitle(profile: ContactShippingProfile): string | null {
  if (profile.recipientType !== "COMPANY") return null;
  const company = profile.companyName?.trim();
  if (!company) return null;
  const edrpou = profile.edrpou?.trim();
  return edrpou ? `${company} (${edrpou})` : company;
}

export function shippingProfilePhone(profile: ContactShippingProfile): string | null {
  if (profile.recipientType === "COMPANY") {
    const phone = profile.contactPersonPhone?.trim() || profile.phone?.trim();
    return phone || null;
  }
  return profile.phone?.trim() || null;
}

export function shippingProfileAddressDetail(profile: ContactShippingProfile): string | null {
  if (profile.deliveryType === "ADDRESS") {
    const parts = [
      profile.streetName || profile.streetRef || "",
      profile.building || "",
      profile.flat ? `${t("shipping.flatShort")} ${profile.flat}` : "",
    ].filter(Boolean);
    return parts.join(", ") || null;
  }

  const number = profile.warehouseNumber?.trim();
  return number ? `№${number}` : null;
}

export function shippingProfileLocationLine(profile: ContactShippingProfile): string {
  const typeLabel = shippingProfileDeliveryTypeLabel(profile.deliveryType);
  const city = profile.cityName?.trim() || profile.cityRef?.trim();
  return city ? `${typeLabel} • ${city}` : typeLabel;
}
