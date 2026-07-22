"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Receipt } from "lucide-react";
import { formatMoneyBase } from "@/app/analytics/analytics-ui";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";

export type DashboardReceivablesData = {
  currency: string;
  reconciliation: {
    snapshotId: string;
    snapshotDate: string;
    isAligned: boolean;
    deltaCount: number;
    total1C: number;
    totalCRM: number;
    totalDelta: number;
  } | null;
};

type Props = {
  data: DashboardReceivablesData | null;
  loading?: boolean;
  currency: BaseCurrency;
  reconcileHref?: string;
};

function formatSnapshotDate(iso: string): string {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE);
  if (!dt.isValid) return iso.slice(0, 10);
  return dt.toLocaleString({ day: "numeric", month: "short", year: "numeric" });
}

export function DashboardReceivablesPanel({ data, loading, currency, reconcileHref }: Props) {
  const t = strings.dashboard.leadership.receivables;
  const displayCurrency = (data?.currency === "EUR" ? "EUR" : currency) as BaseCurrency;
  const href =
    reconcileHref ??
    (data?.reconciliation
      ? `/receivables?tab=reconcile&snapshotId=${encodeURIComponent(data.reconciliation.snapshotId)}&deltasOnly=true`
      : "/receivables");

  return (
    <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Receipt className="h-5 w-5 text-zinc-500" />
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <Link
          href="/receivables"
          className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {t.openFull}
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      ) : !data?.reconciliation ? (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
          {t.noSnapshot}
        </p>
      ) : (
        <>
          <div
            className={`mt-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              data.reconciliation.isAligned
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {data.reconciliation.isAligned ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>
              {data.reconciliation.isAligned
                ? t.alignedBanner(formatSnapshotDate(data.reconciliation.snapshotDate))
                : t.mismatchBanner(
                    data.reconciliation.deltaCount,
                    formatSnapshotDate(data.reconciliation.snapshotDate),
                  )}
            </span>
          </div>

          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReceivableStat
              title={t.mismatchClients}
              value={String(data.reconciliation.deltaCount)}
              risk={data.reconciliation.deltaCount > 0}
              href={href}
            />
            <ReceivableStat
              title={t.debt1C}
              value={formatMoneyBase(data.reconciliation.total1C, displayCurrency)}
              href={href}
            />
            <ReceivableStat
              title={t.debtCrm}
              value={formatMoneyBase(data.reconciliation.totalCRM, displayCurrency)}
              href={href}
            />
            <ReceivableStat
              title={t.delta}
              value={formatMoneyBase(data.reconciliation.totalDelta, displayCurrency)}
              risk={Math.abs(data.reconciliation.totalDelta) > 0.01}
              href={href}
            />
          </div>
        </>
      )}
    </section>
  );
}

function ReceivableStat({
  title,
  value,
  risk,
  href,
}: {
  title: string;
  value: string;
  risk?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        risk ? "border-amber-200" : "border-zinc-200"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <div
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          risk ? "text-amber-800" : "text-zinc-900"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-zinc-600">{strings.dashboard.leadership.receivables.open}</div>
    </Link>
  );
}
