"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/feedback";
import { strings } from "@/locales";
import { receivablesApi, type ContactReceivablesResponse } from "@/lib/api/resources/receivables";

/** Expand/collapse state and lazily loaded per-client details for the clients table. */
export function useClientReceivablesDetails() {
  const { pushToast } = useToast();
  const loadError = strings.receivables.loadError;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Map<string, ContactReceivablesResponse>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    async (contactId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(contactId)) next.delete(contactId);
        else next.add(contactId);
        return next;
      });
      if (details.has(contactId)) return;
      setLoadingIds((prev) => new Set(prev).add(contactId));
      try {
        const res = await receivablesApi.contactReceivables(contactId, {
          paymentsPage: 1,
          paymentsPageSize: 50,
          ordersPage: 1,
          ordersPageSize: 100,
        });
        setDetails((prev) => new Map(prev).set(contactId, res.data));
      } catch {
        pushToast(loadError, "error");
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(contactId);
          return next;
        });
      }
    },
    [details, pushToast, loadError],
  );

  return { expanded, details, loadingIds, toggle };
}
