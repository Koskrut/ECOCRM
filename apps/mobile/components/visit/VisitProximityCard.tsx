import * as Location from "expo-location";
import React, { useEffect, useState } from "react";

import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/lib/design/theme-context";
import { visitProximityStatus, type VisitProximityStatus } from "@/lib/geo-utils";
import { t } from "@/lib/i18n";
import type { VisitSummary } from "@/types/crm";

function proximityLabel(status: VisitProximityStatus): string {
  switch (status) {
    case "verified":
      return t("visit.proximityVerified");
    case "nearby":
      return t("visit.proximityNearby");
    case "outside":
      return t("visit.proximityOutside");
    default:
      return t("visit.proximityNoFix");
  }
}

type Props = {
  visit: Pick<VisitSummary, "id" | "lat" | "lng" | "radiusM">;
};

/** Isolated GPS proximity UI so live updates do not re-render the visit form. */
export const VisitProximityCard = React.memo(function VisitProximityCard({ visit }: Props) {
  const theme = useTheme();
  const [liveDistanceM, setLiveDistanceM] = useState<number | null>(null);
  const [liveAccuracyM, setLiveAccuracyM] = useState<number | null>(null);
  const [liveProximity, setLiveProximity] = useState<VisitProximityStatus>("no_fix");

  useEffect(() => {
    if (visit.lat == null || visit.lng == null) return;

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10_000,
          distanceInterval: 15,
        },
        (pos) => {
          if (cancelled) return;
          const c = pos.coords;
          const accuracyM =
            typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : null;
          const radiusM = visit.radiusM != null && visit.radiusM > 0 ? visit.radiusM : 100;
          const prox = visitProximityStatus({
            visitLat: visit.lat!,
            visitLng: visit.lng!,
            radiusM,
            lat: c.latitude,
            lng: c.longitude,
            accuracyM,
          });

          const distRounded =
            prox.distanceM != null ? Math.round(prox.distanceM) : null;
          setLiveDistanceM((prev) => (prev === distRounded ? prev : distRounded));
          setLiveAccuracyM((prev) => (prev === accuracyM ? prev : accuracyM));
          setLiveProximity((prev) => (prev === prox.status ? prev : prox.status));
        },
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [visit.id, visit.lat, visit.lng, visit.radiusM]);

  if (visit.lat == null || visit.lng == null) return null;

  return (
    <Card>
      <Text style={theme.typography.bodyMedium}>{t("visit.distanceToAddress")}</Text>
      <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: 4 }]}>
        {liveDistanceM != null ? `${liveDistanceM} ${t("common.meters")}` : "—"}
        {" · "}
        {proximityLabel(liveProximity)}
      </Text>
      {liveAccuracyM != null ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
          {t("visit.gpsAccuracy")}: ±{Math.round(liveAccuracyM)} {t("common.meters")}
        </Text>
      ) : null}
    </Card>
  );
});
