"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

export type ContactCardAnalyticsRange = "30d" | "90d" | "365d";
export type ContactCardAnalyticsScope = "contact" | "company";

export type ContactCardAnalytics = {
  meta: {
    range: ContactCardAnalyticsRange;
    scope: ContactCardAnalyticsScope;
    financeRestricted: boolean;
    scopeNote: string | null;
    companyScopeAvailable: boolean;
  };
  kpi: {
    revenue: number;
    ordersCount: number;
    avgOrderValue: number;
  };
  series: {
    revenueByPeriod: Array<{ date: string; revenue: number }>;
    ordersByPeriod: Array<{ date: string; ordersCount: number }>;
  };
  topProducts: Array<{
    productId: string | null;
    productName: string;
    qty: number;
    revenue: number;
  }>;
};

export function useContactCardAnalytics(
  contactId: string,
  opts: { range: ContactCardAnalyticsRange; scope: ContactCardAnalyticsScope; enabled: boolean },
) {
  const [data, setData] = useState<ContactCardAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!opts.enabled || !contactId || contactId === "new") return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<ContactCardAnalytics>(`/contacts/${contactId}/card/analytics`, {
        params: { range: opts.range, scope: opts.scope },
      });
      setData(res.data);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to load contact analytics");
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [contactId, opts.enabled, opts.range, opts.scope]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
