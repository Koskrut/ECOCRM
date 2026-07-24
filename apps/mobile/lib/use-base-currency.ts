import { useEffect, useState } from "react";

import { useAuth } from "@/context/auth-context";
import { settingsApi } from "@/lib/api/settings";
import { normalizeBaseCurrency, type BaseCurrency } from "@/lib/order-currency";

export function useBaseCurrency(): {
  currency: BaseCurrency;
  loading: boolean;
} {
  const { token } = useAuth();
  const [currency, setCurrency] = useState<BaseCurrency>("USD");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setCurrency("USD");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    settingsApi
      .currencyConfig(token)
      .then((res) => {
        if (!cancelled) setCurrency(normalizeBaseCurrency(res.baseCurrency));
      })
      .catch(() => {
        if (!cancelled) setCurrency("USD");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { currency, loading };
}
