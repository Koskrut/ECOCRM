"use client";

import { useEffect, useRef } from "react";
import { presenceApi } from "@/lib/api/resources/presence";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePresenceHeartbeat(enabled: boolean) {
  const tickingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const sendHeartbeat = async () => {
      if (cancelled || tickingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      tickingRef.current = true;
      try {
        await presenceApi.heartbeat();
      } catch {
        /* ignore transient network/auth errors */
      } finally {
        tickingRef.current = false;
      }
    };

    void sendHeartbeat();
    timer = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPageHide = () => {
      void presenceApi.end().catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      void presenceApi.end().catch(() => undefined);
    };
  }, [enabled]);
}
