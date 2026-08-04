"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  dashboardApi,
  type EmployeeTimelineEvent,
} from "@/lib/api/resources/dashboard";
import { formatDateTimeNumeric } from "@/lib/crmDatetime";
import { strings } from "@/locales";

type Props = {
  userId: string;
  fullName: string;
  date: string;
  onClose: () => void;
};

export function EmployeeActivityTimelineDrawer({ userId, fullName, date, onClose }: Props) {
  const t = strings.dashboard.employeeActivity.timeline;
  const [events, setEvents] = useState<EmployeeTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void dashboardApi
      .getEmployeeDailyActivityTimeline(userId, date)
      .then((res) => {
        if (!cancelled) setEvents(res.events);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">{fullName}</h3>
            <p className="text-xs text-zinc-500">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-zinc-500">{t.loading}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.empty}</p>
          ) : (
            <ol className="space-y-3">
              {events.map((ev, idx) => (
                <li key={`${ev.at}-${ev.kind}-${idx}`} className="border-l-2 border-zinc-200 pl-3">
                  <p className="text-xs text-zinc-500">{formatDateTimeNumeric(ev.at)}</p>
                  <p className="text-sm font-medium text-zinc-900">{ev.label}</p>
                  {ev.orderNumber ? (
                    <p className="text-xs text-zinc-600">
                      #{ev.orderNumber}
                      {ev.clientName ? ` · ${ev.clientName}` : ""}
                    </p>
                  ) : ev.clientName ? (
                    <p className="text-xs text-zinc-600">{ev.clientName}</p>
                  ) : null}
                  {ev.meta?.systemSideEffect ? (
                    <p className="text-xs text-amber-700">{t.systemSideEffect}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
