"use client";

import { useCallback, useEffect, useState } from "react";
import { contactsApi, type ContactInsightsResponse } from "@/lib/api/resources/contacts";

export function useContactInsights(contactId: string, enabled: boolean) {
  const [data, setData] = useState<ContactInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !contactId || contactId === "new") return;
    setLoading(true);
    setError(null);
    try {
      const payload = await contactsApi.getInsights(contactId);
      setData(payload);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося завантажити підказку CRM");
      setError(Array.isArray(msg) ? msg.join(", ") : msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [contactId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
