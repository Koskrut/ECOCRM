"use client";

import { useCallback, useState } from "react";
import { apiHttp } from "../../lib/api/client";
import type { ContactCardPayload } from "./contact-card.types";

function cardErrorMessage(e: unknown, fallback: string): string {
  const fromApi = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (typeof fromApi === "string" && fromApi.trim()) return fromApi;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/**
 * Завантаження GET /contacts/:id/card. Викликати `reload` після зміни контакта / замовлень.
 */
export function useContactCard(contactId: string | null, enabled: boolean, errorFallback: string) {
  const [data, setData] = useState<ContactCardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!contactId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<ContactCardPayload>(`/contacts/${contactId}/card`);
      setData(res.data);
    } catch (e) {
      setData(null);
      setError(cardErrorMessage(e, errorFallback));
    } finally {
      setLoading(false);
    }
  }, [contactId, enabled, errorFallback]);

  const clear = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, reload, clear, setError };
}
