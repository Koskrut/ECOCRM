"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttributionFromLocation } from "@/lib/attribution";
import { trackEvent } from "@/lib/tracking";

export function TrackingBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    captureAttributionFromLocation();
    trackEvent("view_landing", { path: pathname });
  }, [pathname]);

  return null;
}

