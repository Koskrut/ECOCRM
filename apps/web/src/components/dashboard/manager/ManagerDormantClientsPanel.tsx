"use client";

import Link from "next/link";
import { Moon } from "lucide-react";
import { DateTime } from "luxon";
import { formatNumber } from "@/app/analytics/analytics-ui";
import type { ContactWorkQueueItem } from "@/lib/api/resources/contacts";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { strings } from "@/locales";

type Props = {
  items: ContactWorkQueueItem[];
  total: number;
  loading: boolean;
  onOpenContact: (id: string) => void;
};

const FULL_LIST_HREF = "/contacts?workPreset=risk-or-dormant&reason=DORMANT";

function formatLastOrder(iso: string | null): string {
  if (!iso) return "—";
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE);
  if (!d.isValid) return "—";
  return d.toLocaleString({ day: "numeric", month: "short", year: "numeric" });
}

export function ManagerDormantClientsPanel({ items, total, loading, onOpenContact }: Props) {
  const t = strings.dashboard.manager.dormant;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Moon className="h-5 w-5 text-violet-600" />
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900">
            {t.countLabel.replace("{count}", formatNumber(total))}
          </p>
          <Link
            href={FULL_LIST_HREF}
            className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
          >
            {t.viewAll}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-lg bg-zinc-100" />
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
          {items.map((item) => {
            const days = item.metrics.daysSinceLastOrder;
            return (
              <li key={item.contact.id}>
                <button
                  type="button"
                  onClick={() => onOpenContact(item.contact.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{item.contact.fullName}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {item.contact.companyName?.trim() || t.noCompany}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="font-medium tabular-nums text-violet-800">
                      {days == null
                        ? t.daysUnknown
                        : t.daysWithoutOrder.replace("{days}", formatNumber(days))}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {t.lastOrder}: {formatLastOrder(item.metrics.lastOrderAt)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
