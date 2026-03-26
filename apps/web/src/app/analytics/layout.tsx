"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiHttp } from "@/lib/api/client";

type MeResponse = { user?: { role?: string } };

const tabs = [
  { href: "/analytics/overview", label: "Overview" },
  { href: "/analytics/sales", label: "Sales" },
  { href: "/analytics/leads", label: "Leads" },
  { href: "/analytics/attention", label: "Attention" },
  { href: "/analytics/managers", label: "Managers" },
  { href: "/analytics/finance", label: "Finance" },
  { href: "/analytics/clients", label: "Clients" },
  { href: "/analytics/products", label: "Products" },
  { href: "/analytics/visits", label: "Visits" },
  { href: "/analytics/operations", label: "Operations" },
  { href: "/analytics/map", label: "Map" },
];

function AnalyticsTabsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${suffix}`}
            className={`rounded-full px-3 py-2 text-sm font-medium ${
              active ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
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
    return <div className="p-6 text-sm text-zinc-500">Завантаження аналітики...</div>;
  }

  if (!canAccess) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Доступ заборонено</h1>
          <p className="mt-2 text-sm text-zinc-600">Розділ аналітики доступний лише для ADMIN та LEAD.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-zinc-900">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">Огляд ключових показників CRM по періоду та менеджеру.</p>
        </div>
        <Suspense fallback={<div className="mb-6 h-10 animate-pulse rounded-lg bg-zinc-200" />}>
          <AnalyticsTabsNav />
        </Suspense>
        <Suspense
          fallback={
            <div className="min-h-[40vh] rounded-xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">
              Завантаження...
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </main>
  );
}

