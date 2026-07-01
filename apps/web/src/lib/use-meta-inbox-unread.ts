"use client";

import { useEffect, useState } from "react";
import { metaConversationsApi, type MetaInboxChannel } from "@/lib/api/resources/meta-conversations";

const POLL_MS = 15_000;

export function useMetaInboxUnread(
  channel: MetaInboxChannel,
  enabled: boolean,
  refreshKey?: string,
): boolean {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHasUnread(false);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const { count } = await metaConversationsApi.unreadCount(channel);
        if (!cancelled) setHasUnread(count > 0);
      } catch {
        if (!cancelled) setHasUnread(false);
      }
    };

    void refresh();
    const id = window.setInterval(refresh, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [channel, enabled, refreshKey]);

  return hasUnread;
}
