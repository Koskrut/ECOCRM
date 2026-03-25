"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Map } from "lucide-react";
import { apiHttp } from "@/lib/api/client";

type MeResponse = { user?: { role?: string } };

const TABS = [
  { label: "Огляд", href: "/analytics/overview" },
  { label: "Продажі", href: "/analytics/sales" },
  { label: "Ліди", href: "/analytics/leads" },
  { label: "Увага", href: "/analytics/attention" },
  { label: "Менеджери", href: "/analytics/managers" },
  { label: "Фінанси", href: "/analytics/finance" },
  { label: "Клієнти", href: "/analytics/clients" },
  { label: "Товари", href: "/analytics/products" },
  { label: "Візити", href: "/analytics/visits" },
  { label: "Операції", href: "/analytics/operations" },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => {
        const nextRole = res.data?.user?.role ?? null;
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-1",
            hypothesisId: "H6",
            location: "analytics/layout.tsx:authMeThen",
            message: "Analytics role loaded",
            data: { role: nextRole, pathname },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setRole(nextRole);
      })
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, [pathname]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="h-32 animate-pulse rounded-lg bg-zinc-200" />
      </div>
    );
  }

  if (role !== "ADMIN" && role !== "LEAD") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Доступ заборонено</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Аналітика доступна для адміністратора та керівника відділу (LEAD).
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent-600 hover:underline">
            На головну
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gradient">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Аналітика</h1>
          <Link
            href="/analytics/map"
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <Map className="h-4 w-4" />
            Карта
          </Link>
        </div>
        <nav className="mt-4 flex flex-wrap gap-1 border-b border-zinc-200">
          {TABS.map((t) => {
            const isActive = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
                  isActive
                    ? "-mb-px border-b-2 border-zinc-900 text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
