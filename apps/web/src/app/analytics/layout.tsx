"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiHttp } from "@/lib/api/client";
import { PageShell } from "@/components/PageShell";
import { strings } from "@/locales";

type MeResponse = { user?: { role?: string } };

const tabs = [
  { href: "/analytics/overview", labelKey: "overview" },
  { href: "/analytics/sales", labelKey: "sales" },
  { href: "/analytics/leads", labelKey: "leads" },
  { href: "/analytics/attention", labelKey: "attention" },
  { href: "/analytics/managers", labelKey: "managers" },
  { href: "/analytics/finance", labelKey: "finance" },
  { href: "/analytics/clients", labelKey: "clients" },
  { href: "/analytics/products", labelKey: "products" },
  { href: "/analytics/visits", labelKey: "visits" },
  { href: "/analytics/operations", labelKey: "operations" },
  { href: "/analytics/map", labelKey: "map" },
] as const;

function AnalyticsTabsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";
  const t = strings.analytics.tabs;

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${suffix}`}
            className={`rounded-full px-3 py-2 text-sm font-medium ${
              active
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100"
            }`}
          >
            {t[tab.labelKey]}
          </Link>
        );
      })}
    </div>
  );
}

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, []);

  const canAccess = useMemo(() => role === "ADMIN" || role === "LEAD", [role]);

  if (loading) {
    return (
      <PageShell>
        <div className="text-sm text-zinc-500">{strings.analytics.loading}</div>
      </PageShell>
    );
  }

  if (!canAccess) {
    return (
      <PageShell>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">
            {strings.analytics.accessDeniedTitle}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">{strings.analytics.accessDeniedHint}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={strings.analytics.pageTitle} subtitle={strings.analytics.pageSubtitle}>
      <Suspense fallback={<div className="mb-6 h-10 animate-pulse rounded-lg bg-zinc-200" />}>
        <AnalyticsTabsNav />
      </Suspense>
      <Suspense
        fallback={
          <div className="min-h-[40vh] rounded-xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">
            {strings.common.loading}
          </div>
        }
      >
        {children}
      </Suspense>
    </PageShell>
  );
}
