"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

export type ContactCardSummary = {
  contact: {
    id: string;
    fullName: string;
    company: { id: string; name: string } | null;
    owner: { id: string; name: string } | null;
    status: string | null;
    clientType: string | null;
    city: string | null;
    region: string | null;
    address: string | null;
    email: string | null;
    phones: string[];
    isUnassigned: boolean;
    badges: string[];
  };
  kpi: {
    ordersCount: number;
    revenue: number;
    debt: number;
    overdue: number;
    orderCredit: number;
    clientBalance: number;
    lastOrderAt: string | null;
    lastActivityAt: string | null;
    openTasksCount: number;
    overdueTasksCount: number;
  };
  insights: {
    nextStep: { title: string; dueAt: string | null } | null;
    riskFlags: string[];
    financeRestricted: boolean;
    scopeNote: string | null;
  };
};

export function useContactCardSummary(contactId: string, enabled: boolean) {
  const [data, setData] = useState<ContactCardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !contactId || contactId === "new") return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<ContactCardSummary>(`/contacts/${contactId}/card`);
      setData(res.data);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося завантажити підсумок картки");
      setError(msg);
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

