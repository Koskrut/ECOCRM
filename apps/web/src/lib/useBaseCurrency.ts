"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import type { BaseCurrency } from "@/lib/base-currency";

type CurrencyConfig = {
  baseCurrency: BaseCurrency;
};

export function useBaseCurrency(): {
  currency: BaseCurrency;
  loading: boolean;
} {
  const [currency, setCurrency] = useState<BaseCurrency>("USD");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiHttp
      .get<CurrencyConfig>("/settings/currency-config")
      .then((res) => {
        if (!cancelled) {
          setCurrency(res.data?.baseCurrency === "EUR" ? "EUR" : "USD");
        }
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
  }, []);

  return { currency, loading };
}
