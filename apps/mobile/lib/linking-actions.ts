import { Alert, Linking } from "react-native";

import { navigationApi } from "@/lib/api/navigation";
import { t } from "@/lib/i18n";

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  return phone.trim();
}

export async function openPhone(phone: string | null | undefined): Promise<void> {
  const p = normalizePhone(phone);
  if (!p) {
    Alert.alert(t("common.error"), t("actions.noPhone"));
    return;
  }
  const url = `tel:${p.replace(/\s/g, "")}`;
  const can = await Linking.canOpenURL(url);
  if (!can) {
    Alert.alert(t("common.error"), t("actions.noPhone"));
    return;
  }
  await Linking.openURL(url);
}

export async function openNavigation(opts: {
  token: string;
  date: string;
  visitId?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  try {
    if (opts.visitId) {
      const { url } = await navigationApi.getUrl(opts.token, {
        date: opts.date,
        mode: "single",
        visitId: opts.visitId,
      });
      await Linking.openURL(url);
      return;
    }
    if (
      typeof opts.lat === "number" &&
      Number.isFinite(opts.lat) &&
      typeof opts.lng === "number" &&
      Number.isFinite(opts.lng)
    ) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${opts.lat},${opts.lng}`;
      await Linking.openURL(url);
      return;
    }
    Alert.alert(t("common.error"), t("actions.noCoords"));
  } catch (e) {
    Alert.alert(t("common.error"), e instanceof Error ? e.message : t("actions.navFailed"));
  }
}
