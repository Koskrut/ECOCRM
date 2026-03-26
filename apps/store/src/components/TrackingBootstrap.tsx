"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttributionFromLocation } from "@/lib/attribution";
import { ensureTrackingReady, trackEvent } from "@/lib/tracking";
import { useStoreConfig } from "@/context/StoreConfigContext";

export function TrackingBootstrap() {
  const pathname = usePathname();
  const { config } = useStoreConfig();
  const gaId = config.analytics?.gaId;
  const gtmId = config.analytics?.gtmId;
  const metaPixelId = config.analytics?.metaPixelId;

  const fireLandingEvent = useCallback(() => {
    ensureTrackingReady();
    captureAttributionFromLocation();
    trackEvent("view_landing", { path: pathname });
  }, [pathname]);

  useEffect(() => {
    // Re-fire on route changes and when runtime analytics ids are loaded from CRM settings.
    fireLandingEvent();
    const retryId = window.setTimeout(() => {
      fireLandingEvent();
    }, 300);
    return () => {
      window.clearTimeout(retryId);
    };
  }, [fireLandingEvent, gaId, gtmId, metaPixelId]);

  useEffect(() => {
    const onConsentUpdated = () => {
      fireLandingEvent();
    };
    window.addEventListener("suprex:consent-updated", onConsentUpdated as EventListener);
    return () => {
      window.removeEventListener("suprex:consent-updated", onConsentUpdated as EventListener);
    };
  }, [fireLandingEvent]);

  return null;
}

